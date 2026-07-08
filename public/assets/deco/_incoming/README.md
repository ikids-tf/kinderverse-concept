# _incoming — 스티커 리소스 드롭 존

신규 스티커 PNG를 **여기에 넣고** 아래 명령을 실행하면 태그별 폴더로 자동 정리됩니다.

```bash
node scripts/genStickerManifest.cjs
```

## 파일명 규칙 (필수)

한글 키워드를 파일명에 담습니다. 확장자는 `.png`.

```
<이름>-IC(<주제어> <세부어> ...).png
```

예시:
- `버스-IC(교통 버스 탈것).png`      → `tag/traffic/vehicle/stk-N.png`
- `신호등-IC(교통 신호등 표지).png`   → `tag/traffic/sign-infra/stk-N.png`
- `횡단보도-IC(교통 보행 사람).png`   → `tag/traffic/person/stk-N.png`
- `구름-IC(뭉게구름 장식).png`        → `tag/traffic/ambient/stk-N.png`

- **주제어**(교통/버스/신호/겨울/여름 …)로 theme 이 정해지고,
- **세부어**(탈것/표지/사람/장식 …)로 subtag 이 정해집니다. 세부어가 없으면 `ambient` 로 분류됩니다.

정리가 끝나면 이 폴더는 비워지고, 파일은 `client/public/assets/deco/tag/<theme>/<subtag>/stk-N.png` 로 이동합니다.
분류 규칙(키워드)은 `scripts/genStickerManifest.cjs` 의 `RULES` / `SUBTAG_RULES` 에서 조정합니다.
