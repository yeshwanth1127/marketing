#!/usr/bin/env bash
# Re-create vendor/ at the exact commits pinned in docs/vendor-inventory.json (vendor/ is not in git).
set -euo pipefail
cd "$(dirname "$0")/.."
node -e '
const inv=require("./docs/vendor-inventory.json");
const urls={"digital-marketing-pro":"indranilbanerjee/digital-marketing-pro","claude-content-skills":"ootto-ai/claude-content-skills","instagram-agent-skill":"Jakeschincariol/instagram-agent-skill","ootto-watch":"ootto-ai/ootto-watch","marketingskills":"coreyhaines31/marketingskills","social-media-skills":"charlie947/social-media-skills","marketing-skills":"kostja94/marketing-skills","hyperframes":"heygen-com/hyperframes","earshot":"Leonxlnx/earshot","claude-youtube-editor":"hassancs91/claude-youtube-editor","claude-video-effects":"Vibha-Ramprakash/claude-video-effects","agency-agents":"msitarzewski/agency-agents"};
for(const r of inv.repositories)console.log(r.repository,urls[r.repository],r.commit);' | while read -r name repo commit; do
  if [ ! -d "vendor/$name/.git" ]; then git clone -q "https://github.com/$repo.git" "vendor/$name"; fi
  git -C "vendor/$name" fetch -q --depth=1 origin "$commit" 2>/dev/null || git -C "vendor/$name" fetch -q origin
  git -C "vendor/$name" checkout -q "$commit"
  echo "vendor/$name @ ${commit:0:10}"
done
