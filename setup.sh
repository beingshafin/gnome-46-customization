#!/bin/bash

# Function to run commands with error handling
run_command() {
    echo "Running: $@"
    "$@"
    if [ $? -ne 0 ]; then
        echo "Error occurred while running: $@"
        echo "Continuing with the script..."
    fi
}


#02 cloning git repo needed
#run_command git clone https://github.com/beingshafin/gnome-46-customization.git ${HOME}/.g46c@shafin


#Setting up download resource folder
mkdir ${HOME}/.g46c@resources

#01 Configuring mirrorlist
run_command sudo cp ${HOME}/.g46c@shafin/config/mirrorlist /etc/pacman.d/mirrorlist


#03 Configuring GRUB to show dual-booted Windows
run_command sudo pacman -Sy --noconfirm
run_command sudo pacman -Sy --needed --noconfirm os-prober 
run_command sudo cp ${HOME}/.g46c@shafin/config/grub /etc/default/grub
run_command sudo grub-mkconfig -o /boot/grub/grub.cfg

#04 Installing basic packages
run_command sudo pacman -S --needed --noconfirm gedit firefox vlc git curl dconf timeshift yt-dlp wmctrl neofetch fastfetch

#05 Installing yay
run_command cd ${HOME}/.g46c@resources
run_command rm -rf ./yay/
run_command sudo pacman -S --needed --noconfirm base-devel git
run_command git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si --noconfirm --needed

#06 Installing yay packages
run_command yay -S --needed --noconfirm visual-studio-code-bin qdirstat ulauncher input-remapper-git gnome-terminal-transparency cava ddcutil-git pamac-all xdman-beta-bin


#07 Installing flatpak packages
run_command flatpak install flathub org.telegram.desktop io.github.mimbrero.WhatsAppDesktop com.mattjakeman.ExtensionManager com.github.dynobo.normcap io.github.seadve.Kooha io.github.celluloid_player.Celluloid



#20 Load GNOME extensions
run_command mkdir -p ${HOME}/.local/share/gnome-shell/extensions
run_command sudo mkdir -p /usr/share/gnome-shell/extensions
run_command cp -r ${HOME}/.g46c@shafin/gnome-extensions/user-extensions/* ${HOME}/.local/share/gnome-shell/extensions/
run_command sudo cp -r ${HOME}/.g46c@shafin/gnome-extensions/system-extensions/* /usr/share/gnome-shell/extensions/
run_command dconf load /org/gnome/shell/extensions/ < ${HOME}/.g46c@shafin/gnome-extensions/extensions-config.conf

#21 Load full dconf settings
run_command dconf load -f / < ${HOME}/.g46c@shafin/gnome-shell-backup-all.conf

#22 Load keybindings
run_command dconf load /org/gnome/desktop/wm/keybindings/ < ${HOME}/.g46c@shafin/config/keybindings/wm-keys.conf

run_command dconf load /org/gnome/shell/keybindings/ < ${HOME}/.g46c@shafin/config/keybindings/shell-keys.conf

run_command dconf load /org/gnome/settings-daemon/plugins/media-keys/ < ${HOME}/.g46c@shafin/config/keybindings/media-keys.conf

run_command dconf load / < custom-shortcuts.conf



# Configuring themes, icons, wallpapers=====================================================
#08 Shell theme
run_command cd ${HOME}/.g46c@resources
run_command rm -rf ./Marble-shell-theme/
run_command git clone https://github.com/imarkoff/Marble-shell-theme.git
run_command cd Marble-shell-theme
run_command python install.py -a
run_command gsettings set org.gnome.shell.extensions.user-theme name "Marble-gray-dark"

#09 GTK theme
run_command cd ${HOME}/.g46c@resources
run_command rm -rf ./dracula-gtk && ${HOME}/.themes/dracula-gtk
run_command git clone https://github.com/dracula/gtk.git dracula-gtk
run_command sudo cp -r dracula-gtk ${HOME}/.themes/
run_command gsettings set org.gnome.desktop.interface gtk-theme "Dracula"
run_command gsettings set org.gnome.desktop.wm.preferences theme "Dracula"

#10 Icons
run_command cd ${HOME}/.g46c@resources
run_command rm -rf ./WhiteSur-icon-theme
run_command git clone https://github.com/vinceliuice/WhiteSur-icon-theme.git
run_command cd WhiteSur-icon-theme
run_command ./install.sh --alternative --theme all
run_command gsettings set org.gnome.desktop.interface icon-theme "WhiteSur-grey-dark"

#11 GRUB theme
run_command sudo cp -r ${HOME}/.g46c@shafin/grub-themes/* /usr/share/grub/themes
run_command sudo cp ${HOME}/.g46c@shafin/grub-themes/grub /etc/default/grub
run_command sudo grub-mkconfig -o /boot/grub/grub.cfg


#12 Wallpaper
run-command mkdir -p ${HOME}/Pictures/wallpapers
run_command cp -r ${HOME}/.g46c@shafin/wallpapers/* ${HOME}/Pictures/wallpapers
run_command gsettings set org.gnome.desktop.background picture-uri 'file:///${HOME}/Pictures/wallpapers/03-g46caw.jpg'
run_command gsettings set org.gnome.desktop.background picture-uri-dark 'file:///${HOME}/Pictures/wallpapers/03-g46caw.jpg'

#13 Adding templates
run_command cd ${HOME}/Templates && rm -rf ./* && touch "Blank File" "Plain Text.txt" "Code.css" "Code.html" "Code.js" "Spreadsheet.xlsx"

#14 Adding path to GNOME context menu
run_command yay -S nautilus-copy-path --needed --noconfirm

#15 Synth Shell setup in bashrc
run_command cd ${HOME}/.g46c@resources
run_command rm -rf ./synth-shell/
run_command git clone --recursive https://github.com/andresgongora/synth-shell.git
run_command cd synth-shell
run_command ./setup.sh
run_command cp ${HOME}/.g46c@shafin/config/synth-shell-prompt.config ${HOME}/.config/synth-shell/
run_command mv ${HOME}/.bashrc ${HOME}/.bashrc-synthog.bak
run_command cp ${HOME}/.g46c@shafin/config/.bashrc ${HOME}/
source ${HOME}/.bashrc

#16 GNOME Nautilus transparency
echo "/* Transparent Sidebar */
window {
  background: alpha(@window_bg_color, 0.7);
}

.sidebar-pane,
.sidebar,
.navigation-sidebar {
    background: alpha(@sidebar_bg_color, 0); /* Set sidebar transparency */
}

.content-pane {
    background: alpha(@view_bg_color, 0.3); /* Match transparency of content area */
}" >> ${HOME}/.config/gtk-4.0/gtk.css

#17 Fixing Nautilus thumbnail issue
run_command sudo pacman -S --needed --noconfirm gst-libav gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly ffmpegthumbnailer
run_command sudo pacman -Rs totem --noconfirm
run_command rm -rf ${HOME}/.cache/thumbnails/

#18 WhatsApp startup and close script
run_command mkdir -p ${HOME}/.myscripts ${HOME}/.config/autostart
run_command cp ${HOME}/.g46c@shafin/config/startup.sh ${HOME}/.myscripts
run_command cp ${HOME}/.g46c@shafin/config/startup.sh.desktop ${HOME}/.config/autostart/

#19 Brightness slider with ddcutil
run_command sudo modprobe i2c-dev
run_command yay -S ddcutil-git --needed --noconfirm
run_command ddcutil capabilities | grep "Feature: 10"
run_command sudo cp /usr/share/ddcutil/data/60-ddcutil-i2c.rules /etc/udev/rules.d
run_command sudo groupadd --system i2c
run_command sudo usermod $USER -aG i2c
run_command sudo touch /etc/modules-load.d/i2c.conf
run_command sudo sh -c 'echo "i2c-dev" >> /etc/modules-load.d/i2c.conf'




#23 Clean up cache
run_command rm -rf ${HOME}/.cache/
run_command sudo pacman -Scc --noconfirm
run_command yay -Scc --noconfirm
run_command sudo pacman -Rns --noconfirm gnome-console

#24 Congratulations
run_command firefox ${HOME}/.g46c@shafin/.extras/Congratulations.pdf

echo "Installation completed successfully! Please Log Out --beingshafin@github"

