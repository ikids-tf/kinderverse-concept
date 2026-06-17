/**
 * 파싱·무결성 헬퍼. 프로젝트의 parseGameSpec / assertSpecIntegrity 컨벤션을 따른다.
 * zod 스키마(구조·참조)는 InteractiveDoc.superRefine 에서 1차로 잡고,
 * 여기서는 더 친절한 에러 + 의미적 경고(라운드 수 vs 설정 등)를 추가로 본다.
 */
import { InteractiveDoc, type InteractiveDoc as Doc } from "./interactiveDoc";

export function parseInteractiveDoc(input: unknown): Doc {
  return InteractiveDoc.parse(input);
}

export function safeParseInteractiveDoc(input: unknown) {
  return InteractiveDoc.safeParse(input);
}

/** 검증 실패 시 throw. (zod 무결성 + 의미적 점검) */
export function assertDocIntegrity(input: unknown): asserts input is Doc {
  const res = InteractiveDoc.safeParse(input);
  if (!res.success) {
    const msg = res.error.issues
      .map((i) => `  - [${i.path.join(".") || "root"}] ${i.message}`)
      .join("\n");
    throw new Error(`InteractiveDoc 무결성 실패:\n${msg}`);
  }
  const warnings = collectWarnings(res.data);
  if (warnings.length) {
    // 경고는 throw 하지 않고 알린다. (조립기가 무시 가능)
    // eslint-disable-next-line no-console
    console.warn("InteractiveDoc 경고:\n" + warnings.map((w) => "  - " + w).join("\n"));
  }
}

/** throw 하지 않는 경고 수집기. */
export function collectWarnings(doc: Doc): string[] {
  const w: string[] = [];

  // 라운드 수가 설정 길이와 다르면 경고 (틀린 건 아니지만 의도와 다를 수 있음)
  const it = doc.interaction;
  if ("rounds" in it && it.rounds.length !== doc.settings.length) {
    w.push(
      `라운드 수(${it.rounds.length}) ≠ settings.length(${doc.settings.length})`
    );
  }

  // tap-the-right-one: 옵션 수가 settings.optionCount 와 다르면 경고
  if (it.kind === "tap-the-right-one") {
    it.rounds.forEach((r, i) => {
      if (r.options.length !== doc.settings.optionCount) {
        w.push(
          `round ${i}: 옵션 ${r.options.length}개 ≠ settings.optionCount(${doc.settings.optionCount})`
        );
      }
    });
    if (it.optionSlotIds.length !== doc.settings.optionCount) {
      w.push(
        `optionSlotIds ${it.optionSlotIds.length}개 ≠ settings.optionCount(${doc.settings.optionCount})`
      );
    }
  }

  return w;
}
