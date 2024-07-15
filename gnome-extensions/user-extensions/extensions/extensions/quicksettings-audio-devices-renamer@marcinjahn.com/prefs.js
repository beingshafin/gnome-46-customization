import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

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

function validate(namesMap) {
    const customNames = Object.keys(namesMap).reduce((acc, originalName) => {
        return [...acc, namesMap[originalName]];
    }, []);
    if (hasEmptyValues(customNames)) {
        return error("Device name cannot be empty");
    }
    if (hasDuplicates(customNames)) {
        return error("Devices need to have unique names");
    }

    return ok();
}

function hasEmptyValues(names) {
    return (names.filter((n) => n === "" || n === null || n === undefined).length > 0);
}

function hasDuplicates(names) {
    const set = new Set(names);

    return set.size !== names.length;
}

function ok() {
    return {
        isOk: true,
        errorMessage: null,
    };
}

function error(message) {
    return {
        isOk: false,
        errorMessage: message,
    };
}

class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = new SettingsUtils(this.getSettings(SettingsPath));
        window.add(this.createOutputsPage(settings, window));
        window.add(this.createInputsPage(settings, window));
    }

    createOutputsPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: "Outputs",
            iconName: "audio-speakers-symbolic",
        });
        const group = new Adw.PreferencesGroup({
            title: "Output Audio Devices",
            description: "Rename devices and apply the changes",
        });
        page.add(group);
        const outputs = settings.getOutputNamesMap();
        Object.keys(outputs).forEach((originalName) => {
            const customName = outputs[originalName];
            group.add(this.createDeviceRow(originalName, customName, settings, "output", window));
        });

        return page;
    }

    createInputsPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: "Inputs",
            iconName: "audio-input-microphone-symbolic",
        });
        const group = new Adw.PreferencesGroup({
            title: "Input Audio Devices",
            description: "Rename devices and apply the changes",
        });
        page.add(group);
        const inputs = settings.getInputNamesMap();
        Object.keys(inputs).forEach((originalName) => {
            const customName = inputs[originalName];
            group.add(this.createDeviceRow(originalName, customName, settings, "input", window));
        });

        return page;
    }

    createDeviceRow(originalName, customName, settings, type, window) {
        const row = new Adw.EntryRow({
            title: originalName,
            text: customName,
            show_apply_button: true,
        });
        const resetButton = new Gtk.Button({
            icon_name: "view-refresh",
            has_frame: false,
            tooltip_text: "Restore original name",
        });
        resetButton.connect("clicked", () => {
            row.text = originalName;
            this.restoreDevice(type, settings, originalName);
        });
        row.add_suffix(resetButton);
        row.connect("apply", ({ title, text }) => {
            this.applyCustomName(type, settings, title, text, window);
        });

        return row;
    }

    applyCustomName(type, settings, originalName, customName, window) {
        const currentMap = type === "output"
            ? settings.getOutputNamesMap()
            : settings.getInputNamesMap();
        const newMap = {
            ...currentMap,
            [originalName]: customName,
        };
        const validation = validate(newMap);
        if (!validation.isOk) {
            this.displayError(window, validation.errorMessage);
        }
        else {
            type === "output"
                ? settings.setOutputNamesMap(newMap)
                : settings.setInputNamesMap(newMap);
        }
    }

    restoreDevice(type, settings, originalName) {
        const currentMap = type === "output"
            ? settings.getOutputNamesMap()
            : settings.getInputNamesMap();
        const newMap = {
            ...currentMap,
            [originalName]: originalName,
        };
        type === "output"
            ? settings.setOutputNamesMap(newMap)
            : settings.setInputNamesMap(newMap);
    }

    displayError(window, error) {
        window.add_toast(new Adw.Toast({
            title: error,
            priority: Adw.ToastPriority.HIGH,
            timeout: 5,
        }));
    }
}

export { Preferences as default };
