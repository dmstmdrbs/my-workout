/**
 * 타입 선언 전용 파일. `build-brand-assets.mjs`는 순수 JS라 tsc가 shape을 모를 때
 * `implicitly has an 'any' type` 오류를 낸다. 이 파일 하나로 `symbolSvg`의 타입만
 * 알려주고, 스크립트 실행 로직에는 영향을 주지 않는다(런타임에 로드되지 않음).
 */
export function symbolSvg(options?: { inset?: number; radius?: number }): string
