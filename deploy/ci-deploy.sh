#!/bin/sh
# Forced command for the CI deploy key in ~/.ssh/authorized_keys (see README.md,
# "Continuous deployment"). The key can do nothing but this: the only input is the
# commit sha sent as the SSH command, and it must be a full 40-character hex sha.
set -eu

sha="${SSH_ORIGINAL_COMMAND:-}"
case "$sha" in
	"" | *[!0-9a-f]*)
		echo "expected a commit sha" >&2
		exit 2
		;;
esac
if [ "${#sha}" -ne 40 ]; then
	echo "expected a full 40-character commit sha" >&2
	exit 2
fi

# One deploy at a time, also against someone deploying by hand with deploy.sh.
script="$(cd "$(dirname "$0")" && pwd)/deploy.sh"
exec flock --wait 1200 /tmp/biletflow-deploy.lock sh "$script" "$sha"
