#!/usr/bin/env bash
# 놀이기록·주제망(topicweb)·주안(weeklyplan) 편집 캔버스의 정적 에셋을 타깃 앱의 public/ 로 복사한다.
#   사용법: ./copy-assets.sh <source-public-dir> <target-public-dir>
#   예:    ./copy-assets.sh ../../../public ../../my-app/public   # source = verse 의 client/public
# 코드가 절대경로(/fonts/…, /assets/…, /generated-assets/…)로 참조하므로 타깃 public 루트에 동일 구조로 둔다.
# 이전 버전은 frames·autumn-record·weekly-record·topicweb-record·eco·traffic-record-ai 를 빠뜨렸다 → 통째 복사로 해결.
set -euo pipefail
SRC="${1:?source public dir (예: verse 의 client/public)}"; DST="${2:?target public dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$DST/fonts" "$DST/assets" "$DST/generated-assets"

# 1) 폰트 7종 (source 우선, 없으면 모듈 동봉분)
if [ -d "$SRC/fonts" ]; then cp -R "$SRC/fonts/." "$DST/fonts/"; else cp -R "$HERE/assets/fonts/." "$DST/fonts/"; fi

# 2) assets — 캔버스가 참조하는 deco(스티커 라이브러리)·frames 필수, banners/characters 는 있으면 함께
for d in deco frames banners characters; do
  if [ -d "$SRC/assets/$d" ]; then mkdir -p "$DST/assets/$d"; cp -R "$SRC/assets/$d/." "$DST/assets/$d/"; fi
done

# 3) generated-assets — 하위 폴더 전부 + 루트 loose(stk-winter-*, deco-*) 통째 복사(누락 방지)
cp -R "$SRC/generated-assets/." "$DST/generated-assets/"

echo "복사 완료 → $DST  (fonts / assets{deco,frames,banners,characters} / generated-assets 전체)"
