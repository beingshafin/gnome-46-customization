#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
alias grep='grep --color=auto'
PS1='[\u@\h \W]\$ '

neofetch

##-----------------------------------------------------
## synth-shell-prompt.sh
if [ -f /home/shafin/.config/synth-shell/synth-shell-prompt.sh ] && [ -n "$( echo $- | grep i )" ]; then
	source /home/shafin/.config/synth-shell/synth-shell-prompt.sh
fi


##------------------------------------------------------
## My Alias
alias ytdlp='mkdir -p /mnt/Daniela/Videos/yt-dlp && cd /mnt/Daniela/Videos/yt-dlp && yt-dlp --no-playlist'

alias ytdlp-p='mkdir -p /mnt/Daniela/Videos/yt-dlp && cd /mnt/Daniela/Videos/yt-dlp && yt-dlp'


