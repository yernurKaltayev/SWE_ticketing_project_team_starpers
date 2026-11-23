#!/bin/sh
# Deploys one master commit on this server: deploy/deploy.sh <full commit sha>
# Run by ci-deploy.sh for the CI deploy key, or by hand. If the new stack does not become
# healthy it rolls back to the commit that was running before (best effort: database
# migrations already applied by the new API are not reverted).
set -eu

# Everything runs from main(): `git reset` below rewrites this file while it executes, and
# sh reads a script as it goes, so the whole body has to be parsed before that happens.
main() {
	sha="$1"
	repo="$(cd "$(dirname "$0")/.." && pwd)"
	cd "$repo"

	git fetch --quiet origin master
	tip="$(git rev-parse origin/master)"
	if [ "$sha" != "$tip" ]; then
		echo "skip: $sha is no longer the tip of master ($tip), which deploys itself"
		return 0
	fi

	previous="$(git rev-parse HEAD)"
	git checkout --quiet master
	git reset --quiet --hard "$sha"
	echo "deploying $sha (was $previous)"

	cd "$repo/deploy"
	if docker compose up -d --build --wait --remove-orphans; then
		docker image prune -f >/dev/null
		echo "deployed $sha"
		return 0
	fi

	echo "deploy of $sha failed; rolling back to $previous" >&2
	cd "$repo"
	git reset --quiet --hard "$previous"
	cd "$repo/deploy"
	docker compose up -d --build --wait --remove-orphans || true
	return 1
}

main "$@"; exit
