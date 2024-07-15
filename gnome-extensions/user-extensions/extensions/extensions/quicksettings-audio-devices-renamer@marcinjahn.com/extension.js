import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';
import Gvc from 'gi://Gvc';

let timeoutSourceIds = [];
function delay(milliseconds) {
    return new Promise((resolve) => {
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
            removeFinishedTimeoutId(timeoutId);
            resolve(undefined);

            return GLib.SOURCE_REMOVE;
        });
        if (!timeoutSourceIds) {
            timeoutSourceIds = [];
        }
        timeoutSourceIds.push(timeoutId);
    });
}

function removeFinishedTimeoutId(timeoutId) {
    timeoutSourceIds?.splice(timeoutSourceIds.indexOf(timeoutId), 1);
}

function disposeDelayTimeouts() {
    timeoutSourceIds?.forEach((sourceId) => {
        GLib.Source.remove(sourceId);
    });
    timeoutSourceIds = null;
}

class ObservableMap extends Map {
    constructor() {
        super(...arguments);
        this.observers = new Map();
        this._lastId = -1;
    }

    static fromNativeMap(map) {
        const observableMap = new ObservableMap();
        for (const [id, item] of map) {
            observableMap.set(id, item);
        }

        return observableMap;
    }

    subscribe(handler) {
        this.observers.set(++this._lastId, handler);

        return this._lastId;
    }

    unsubscribe(id) {
        this.observers.delete(id);
    }

    set(key, value) {
        super.set(key, value);
        for (const [_, handler] of this.observers) {
            handler();
        }

        return this;
    }

    toNativeMap() {
        return new Map(this);
    }
}

const QuickSettings = Main.panel.statusArea.quickSettings;

class AudioPanelWrapper {
    getDisplayedDeviceIds(type) {
        const devices = type === "output"
            ? QuickSettings._volumeOutput._output._deviceItems
            : QuickSettings._volumeInput._input._deviceItems;

        return Array.from(devices, ([id]) => id);
    }

    applyUpdate(updates, type) {
        const devices = type === "output"
            ? QuickSettings._volumeOutput._output._deviceItems
            : QuickSettings._volumeInput._input._deviceItems;
        Array.from(devices, ([_, value]) => value).forEach((entry) => {
            const currentName = entry.label.get_text();
            const newName = updates.filter(({ oldName }) => oldName === currentName)[0]?.newName;
            if (!newName) {
                return;
            }
            entry.label.set_text(newName);
        });
    }

    /**
     * Subscribes to events of Audio Panel list growing.
     * It is an alternative to Mixer output/input-added subscription,
     * which has a benefit of notifying of changes caused by the
     * quick-settings-audio-devices-hider extension
     */
    subscribeToAdditions(type, handler) {
        const volume = type === "output"
            ? QuickSettings._volumeOutput._output
            : QuickSettings._volumeInput._input;
        let observableMap;
        if (volume._deviceItems instanceof ObservableMap) {
            observableMap = volume._deviceItems;
        }
        else {
            observableMap = ObservableMap.fromNativeMap(volume._deviceItems);
            volume._deviceItems = observableMap;
        }

        return observableMap.subscribe(handler);
    }

    unsubscribeFromAdditions(type, subscriptionId) {
        const volume = type === "output"
            ? QuickSettings._volumeOutput._output
            : QuickSettings._volumeInput._input;
        if (!(volume._deviceItems instanceof ObservableMap)) {
            return;
        }
        const observableMap = volume._deviceItems;
        observableMap.unsubscribe(subscriptionId);
        volume._deviceItems = observableMap.toNativeMap();
    }
}

function generateDiffUpdate(currentState, desiredState) {
    const updates = [];
    Object.keys(desiredState).forEach((originalName) => {
        if (currentState[originalName] === desiredState[originalName]) {
            return;
        }
        if (currentState[originalName]) {
            updates.push({
                oldName: currentState[originalName],
                newName: desiredState[originalName],
            });
        }
    });

    return updates;
}

function generateUpdateFromSingleState(state) {
    return Object.keys(state).map((originalName) => ({
        oldName: originalName,
        newName: state[originalName],
    }));
}

function range(amount) {
    return [...Array(amount).keys()];
}

/**
 * Display name format copied from
 * https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/status/volume.js#L132
 * The "-" is U+2013 on purpose
 * @param id
 * @param description
 * @param origin
 * @param type
 */
function getAudioDevice(id, description, origin, type) {
    if (!description)
        description = "unknown device";

    return {
        id,
        displayName: origin ? `${description} – ${origin}` : description,
        type,
    };
}

class MixerWrapper {
    constructor(mixer, disposal) {
        this.mixer = mixer;
        this.disposal = disposal;
    }

    getAudioDevicesFromIds(ids, type) {
        return ids.map((id) => {
            const lookup = type === "output"
                ? this.mixer.lookup_output_id(id)
                : this.mixer.lookup_input_id(id);

            return getAudioDevice(id, lookup?.get_description(), lookup?.get_origin(), type);
        });
    }

    /**
     * Uses a Dummy Device "trick" from
     * https://github.com/kgshank/gse-sound-output-device-chooser/blob/master/sound-output-device-chooser@kgshank.net/base.js#LL299C20-L299C20
     * @param displayNames display names
     * @param type
     * @returns A list of matching audio devices. If a given display name is not found,
     * undefined is returned in its place.
     */
    getAudioDevicesFromDisplayNames(displayNames, type) {
        const dummyDevice = new Gvc.MixerUIDevice();
        const devices = this.getAudioDevicesFromIds(range(dummyDevice.get_id()), type);

        return displayNames.map((name) => devices.find((device) => device.displayName === name));
    }

    subscribeToActiveDeviceChanges(callback) {
        const outputSubId = this.mixer.connect("active-output-update", (_, deviceId) => callback({ deviceId, type: "active-output-update" }));
        const inputSubId = this.mixer.connect("active-input-update", (_, deviceId) => callback({ deviceId, type: "active-input-update" }));

        return { ids: [outputSubId, inputSubId] };
    }

    unsubscribe(subscription) {
        subscription.ids.forEach((id) => {
            this.mixer.disconnect(id);
        });
    }

    dispose() {
        this.disposal();
    }
}

async function waitForMixerToBeReady(mixer) {
    while (mixer.get_state() === Gvc.MixerControlState.CONNECTING) {
        await delay(200);
    }
    const state = mixer.get_state();
    if (state === Gvc.MixerControlState.FAILED) {
        throw new Error("MixerControl is in a failed state");
    }
    else if (state === Gvc.MixerControlState.CLOSED) {
        throw new Error("MixerControl is in a closed state");
    }
}

class AudioPanelMixerSource {
    async getMixer() {
        const mixer = Volume.getMixerControl();
        await waitForMixerToBeReady(mixer);
        await delay(200);

        return new MixerWrapper(mixer, () => { });
    }
}

const SettingsPath = "org.gnome.shell.extensions.quicksettings-audio-devices-renamer";
const OutputNamesMap = "output-names-map";
const InputNamesMap = "input-names-map";

class SettingsUtils {
    constructor(settings) {
        this.settings = settings;
    }

    getOutputNamesMap() {
        const value = this.settings.get_value(OutputNamesMap);

        return value.recursiveUnpack();
    }

    setOutputNamesMap(values) {
        this.settings.set_value(OutputNamesMap, new GLib.Variant("a{ss}", values));
    }

    getInputNamesMap() {
        const value = this.settings.get_value(InputNamesMap);

        return value.recursiveUnpack();
    }

    setInputNamesMap(values) {
        this.settings.set_value(InputNamesMap, new GLib.Variant("a{ss}", values));
    }

    connectToChanges(settingName, func) {
        return this.settings.connect(`changed::${settingName}`, func);
    }

    disconnect(subscriptionId) {
        this.settings.disconnect(subscriptionId);
    }
}

/**
 * Reverses each entry in the map, so that the value becomes a key, and key becomes a value
 * in the resulting object
 * @param map Input names map
 * @returns Reversed map
 */
function reverseNamesMap(map) {
    return Object.keys(map).reduce((acc, originalName) => ({
        ...acc,
        [map[originalName]]: originalName,
    }), {});
}

function applyUpdateToQst({ oldName, newName }) {
    const tweakerLabel = getTweakerLabel(oldName);
    if (!tweakerLabel) {
        return;
    }
    tweakerLabel.text = newName;
}

function restoreQst(outputs, inputs) {
    restore(outputs);
    restore(inputs);
}

function restore(map) {
    for (const originalName of Object.keys(map)) {
        const label = getTweakerLabel(map[originalName]);
        if (label) {
            label.text = originalName;
            break;
        }
    }
}

function getTweakerLabel(content) {
    const grid = Main.panel.statusArea.quickSettings.menu._grid;
    const children = grid.get_children();
    const tweakerLabel = children.filter((c) => c.text === content);

    return tweakerLabel.length > 0 ? tweakerLabel[0] : null;
}

class QuickSettingsAudioDevicesRenamerExtension extends Extension {
    constructor() {
        super(...arguments);
        this._mixer = null;
        this._audioPanel = null;
        this._settings = null;
        this._outputSettingsSubscription = null;
        this._inputSettingsSubscription = null;
        this._lastOutputsMap = null;
        this._lastInputsMap = null;
        this._audioPanelOutputsSub = null;
        this._audioPanelInputsSub = null;
        this._activeDeviceSub = null;
    }

    enable() {
        console.log(`Enabling extension ${this.uuid}`);
        this._audioPanel = new AudioPanelWrapper();
        this._settings = new SettingsUtils(this.getSettings(SettingsPath));
        new AudioPanelMixerSource().getMixer().then((mixer) => {
            this._mixer = mixer;
            this.setupSettingMapsChangesHandling();
            this.initialSettingsSetup();
            this.setupAudioPanelChangesSubscription();
            this.setupAcitveDeviceChangesSubscription();
            this.forceOutputAudioPanelUpdate();
            this.forceInputAudioPanelUpdate();
            // Allow Quick Settings Tweaker to load and apply its changes
            delay(500).then(() => {
                this.updateQuickSettingsTweaker();
            });
        });
    }

    updateQuickSettingsTweaker() {
        if (!this._settings) {
            return;
        }
        const maps = {
            ...this._settings.getOutputNamesMap(),
            ...this._settings.getInputNamesMap(),
        };
        Object.keys(maps).forEach((originalName) => {
            applyUpdateToQst({
                oldName: originalName,
                newName: maps[originalName],
            });
        });
    }

    setupSettingMapsChangesHandling() {
        if (!this._settings) {
            return;
        }
        this._outputSettingsSubscription = this._settings.connectToChanges(OutputNamesMap, this.outputsSettingsMapUpdated.bind(this));
        this._inputSettingsSubscription = this._settings.connectToChanges(InputNamesMap, this.inputsSettingsMapUpdated.bind(this));
    }

    outputsSettingsMapUpdated() {
        if (!this._settings || !this._lastOutputsMap || !this._audioPanel) {
            return;
        }
        const newMap = this._settings.getOutputNamesMap();
        const updates = generateDiffUpdate(this._lastOutputsMap, newMap);
        this._lastOutputsMap = newMap;
        this._audioPanel.applyUpdate(updates, "output");
        updates.forEach((update) => applyUpdateToQst(update));
    }

    inputsSettingsMapUpdated() {
        if (!this._settings || !this._lastInputsMap || !this._audioPanel) {
            return;
        }
        const newMap = this._settings.getInputNamesMap();
        const updates = generateDiffUpdate(this._lastInputsMap, newMap);
        this._lastInputsMap = newMap;
        this._audioPanel.applyUpdate(updates, "input");
        updates.forEach((update) => applyUpdateToQst(update));
    }

    forceOutputAudioPanelUpdate() {
        if (!this._settings || !this._lastOutputsMap || !this._audioPanel) {
            return;
        }
        const map = this._settings.getOutputNamesMap();
        const updates = generateUpdateFromSingleState(map);
        this._audioPanel.applyUpdate(updates, "output");
    }

    forceInputAudioPanelUpdate() {
        if (!this._settings || !this._lastInputsMap || !this._audioPanel) {
            return;
        }
        const map = this._settings.getInputNamesMap();
        const updates = generateUpdateFromSingleState(map);
        this._audioPanel.applyUpdate(updates, "input");
    }

    setupAudioPanelChangesSubscription() {
        if (!this._audioPanel) {
            return;
        }
        this._audioPanelOutputsSub = this._audioPanel.subscribeToAdditions("output", () => {
            this.setOutputsMapInSettings();
            this.forceOutputAudioPanelUpdate();
        });
        this._audioPanelOutputsSub = this._audioPanel.subscribeToAdditions("input", () => {
            this.setInputsMapInSettings();
            this.forceInputAudioPanelUpdate();
        });
    }

    /**
     * Quick Settings Tweaker extension integration
     */
    setupAcitveDeviceChangesSubscription() {
        this._mixer?.subscribeToActiveDeviceChanges((event) => {
            // delay due to race condition with Quick Settings Tweaker
            delay(200).then(() => {
                if (!this._mixer || !this._settings) {
                    return;
                }
                const deviceType = event.type === "active-output-update" ? "output" : "input";
                const devices = this._mixer.getAudioDevicesFromIds([event.deviceId], deviceType);
                if (devices.length < 1) {
                    return;
                }
                const map = deviceType === "output"
                    ? this._settings.getOutputNamesMap()
                    : this._settings.getInputNamesMap();
                const originalName = devices[0].displayName;
                const customName = map[originalName];
                if (!customName) {
                    return;
                }
                applyUpdateToQst({
                    oldName: originalName,
                    newName: customName,
                });
            });
        });
    }

    initialSettingsSetup() {
        this.setOutputsMapInSettings();
        this.setInputsMapInSettings();
        this._lastOutputsMap = this._settings.getOutputNamesMap();
        this._lastInputsMap = this._settings.getInputNamesMap();
    }

    setOutputsMapInSettings() {
        if (!this._audioPanel || !this._mixer || !this._settings) {
            return;
        }
        const allOutputIds = this._audioPanel.getDisplayedDeviceIds("output");
        const allOriginalOutputNames = this._mixer
            .getAudioDevicesFromIds(allOutputIds, "output")
            ?.map(({ displayName }) => displayName);
        if (!allOriginalOutputNames) {
            return;
        }
        const existingOutputsMap = this._settings.getOutputNamesMap();
        const existingOriginalOutputs = Object.keys(existingOutputsMap);
        const newDevices = allOriginalOutputNames.filter((name) => !existingOriginalOutputs.includes(name));
        const newSettings = {
            ...existingOutputsMap,
            ...newDevices.reduce((acc, originalDeviceName) => ({
                ...acc,
                [originalDeviceName]: originalDeviceName,
            }), {}),
        };
        this._settings.setOutputNamesMap(newSettings);
    }

    setInputsMapInSettings() {
        if (!this._audioPanel || !this._mixer || !this._settings) {
            return;
        }
        const allInputIds = this._audioPanel.getDisplayedDeviceIds("input");
        const allOriginalInputNames = this._mixer
            .getAudioDevicesFromIds(allInputIds, "input")
            ?.map(({ displayName }) => displayName);
        if (!allOriginalInputNames) {
            return;
        }
        const existingInputsMap = this._settings.getInputNamesMap();
        const existingOriginalInputs = Object.keys(existingInputsMap);
        const newDevices = allOriginalInputNames.filter((name) => !existingOriginalInputs.includes(name));
        const newSettings = {
            ...existingInputsMap,
            ...newDevices.reduce((acc, originalDeviceName) => ({
                ...acc,
                [originalDeviceName]: originalDeviceName,
            }), {}),
        };
        this._settings.setInputNamesMap(newSettings);
    }

    disable() {
        console.log(`Disabling extension ${this.uuid}`);
        if (this._activeDeviceSub) {
            this._mixer?.unsubscribe(this._activeDeviceSub);
            this._activeDeviceSub = null;
        }
        this._mixer?.dispose();
        if (this._outputSettingsSubscription) {
            this._settings?.disconnect(this._outputSettingsSubscription);
            this._outputSettingsSubscription = null;
        }
        if (this._inputSettingsSubscription) {
            this._settings?.disconnect(this._inputSettingsSubscription);
            this._inputSettingsSubscription = null;
        }
        if (this._audioPanelOutputsSub) {
            this._audioPanel?.unsubscribeFromAdditions("output", this._audioPanelOutputsSub);
            this._audioPanelOutputsSub = null;
        }
        if (this._audioPanelInputsSub) {
            this._audioPanel?.unsubscribeFromAdditions("input", this._audioPanelInputsSub);
            this._audioPanelInputsSub = null;
        }
        this.restoreOutputs();
        this.restoreInputs();
        if (this._settings) {
            restoreQst(this._settings.getOutputNamesMap(), this._settings.getInputNamesMap());
        }
        disposeDelayTimeouts();
        this._settings = null;
        this._audioPanel = null;
        this._lastOutputsMap = null;
        this._lastInputsMap = null;
        this._mixer = null;
    }

    restoreOutputs() {
        const freshOutputsMap = this._settings?.getOutputNamesMap();
        if (freshOutputsMap) {
            const update = generateUpdateFromSingleState(reverseNamesMap(freshOutputsMap));
            this._audioPanel?.applyUpdate(update, "output");
        }
    }

    restoreInputs() {
        const freshInputsMap = this._settings?.getInputNamesMap();
        if (freshInputsMap) {
            const update = generateUpdateFromSingleState(reverseNamesMap(freshInputsMap));
            this._audioPanel?.applyUpdate(update, "input");
        }
    }
}

export { QuickSettingsAudioDevicesRenamerExtension as default };
