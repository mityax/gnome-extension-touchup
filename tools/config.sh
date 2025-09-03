# Override variables in here using project top-level `.env` or `.env.local` respectively.

export EXTENSION_ID="touchup@mityax"
export TOOLBOX_NAME='touchup-dev'

export projectDir="$(dirname "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)")"
export distDir="$projectDir/dist"
export buildDir="$distDir/output"

export toolsDir="$projectDir/tools"
export shellRepoRoot="$toolsDir/.gnome-shell"
export shellRepoToolsDir="$shellRepoRoot/tools/toolbox"


# Load the .env file(s)
set -a
source "$projectDir"/.env
if [[ -f "$projectDir"/.env.local ]]; then
  source "$projectDir"/.env.local
fi
set +a
