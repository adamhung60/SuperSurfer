#!/bin/sh
set -eu
old_pid=$1
target=$2
staged=$3
backup=$4
status=$5
i=0
while kill -0 "$old_pid" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    printf '%s\n' 'Restart cancelled: the previous app did not close.' > "$status"
    exit 1
  fi
  sleep 1
done
if ! mv "$target" "$backup"; then
  printf '%s\n' 'Update failed: the current app could not be backed up.' > "$status"
  exit 1
fi
if ! mv "$staged" "$target"; then
  mv "$backup" "$target"
  printf '%s\n' 'Update failed: the new app could not be installed.' > "$status"
  exit 1
fi
if ! /usr/bin/open -a "$target"; then
  mv "$target" "$staged"
  mv "$backup" "$target"
  /usr/bin/open -a "$target" || true
  printf '%s\n' 'Update failed to launch. The previous app was restored.' > "$status"
  exit 1
fi
printf '%s\n' "Restart command sent. Previous app backup: $backup" > "$status"
rmdir "$(dirname "$staged")" 2>/dev/null || true
