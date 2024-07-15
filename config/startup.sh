#!/bin/bash

# Start applications
nohup flatpak run io.github.mimbrero.WhatsAppDesktop & disown

# Wait for a bit to let the applications start
sleep 1

# Enable show desktop mode to hide all windows
end_show_desktop=$((SECONDS+2)) 

while [ $SECONDS -lt $end_show_desktop ]; do
  # Run wmctrl -k on
  wmctrl -k on
  
  # Check if the command was successful
  if [ $? -eq 0 ]; then
    echo "Show desktop enabled successfully"
    break
  fi

  sleep 1  # Sleep for 1 second
done

# Wait for a bit to let the applications start
sleep 8

# Attempt to close WhatsApp once per second for 10 sec
end=$((SECONDS+10))  

while [ $SECONDS -lt $end ]; do
  # Try to close WhatsApp window
  wmctrl -c "WhatsApp"
  
  # Check if the WhatsApp window still exists
  if ! wmctrl -l | grep -q "WhatsApp"; then
    echo "WhatsApp closed successfully"
    exit 0
  fi
  
  sleep 1  
done

echo "Failed to close WhatsApp"

