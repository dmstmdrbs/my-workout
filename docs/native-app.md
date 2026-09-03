# Trainlog 네이티브 앱 가이드

Trainlog는 기존 React/Vite PWA를 유지하면서 Capacitor로 iOS와 Android를
함께 배포한다.

## 앱 식별자와 지원 범위

- 표시 이름: `Trainlog`
- iOS Bundle ID / Android Application ID: `app.trainlog.mobile`
- OAuth 커스텀 스킴: `trainlog`
- OAuth 콜백: `trainlog://auth/callback`
- iOS 최저 버전: iOS 15
- Android 최저 버전: API 24(Android 7)

현재 네이티브 범위는 앱 쉘, Google OAuth 딥링크, 휴식 종료 로컬 알림이다.
친구 운동 시작과 미운동 리마인더처럼 서버에서 보내는 원격 푸시는 후속
범위다.

네이티브 WebView의 `navigator.onLine` 값은 실제 연결 상태와 다를 수 있다.
앱에서는 `@capacitor/network` 결과를 TanStack Query의 온라인 상태로 사용하며,
브라우저 빌드는 기존 `online`/`offline` 이벤트를 유지한다.

## 개발 환경

Capacitor 8은 Node.js 22 이상, Xcode 26 이상, Android Studio 2025.2.1 이상을
요구한다. Android SDK 36을 권장한다.

macOS에서 `java`가 잡히지 않으면 Android Studio 내장 JDK를 사용한다.

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

`.env.local`에 웹과 동일한 Supabase publishable 설정을 둔다. `service_role`, APNs 키,
Firebase 관리자 키는 앱 번들이나 저장소에 넣지 않는다.

## 빌드와 실행

```bash
# 웹 프로덕션 빌드 → iOS/Android 자산 복사 → 네이티브 플러그인 동기화
npm run native:sync

# 시뮬레터나 실기기 선택 후 실행
npm run native:ios
npm run native:android

# IDE에서 열기
npm run native:open:ios
npm run native:open:android
```

`ios/App/App/public`과 `android/app/src/main/assets/public`은 `native:sync`가 만드는 복사본이라
Git에 커밋하지 않는다.

## Google OAuth 설정

Supabase Dashboard의 **Authentication > URL Configuration > Redirect URLs**에 다음을
추가해야 실기기 Google 로그인이 앱으로 돌아온다.

```text
trainlog://auth/callback
```

Google Cloud Console의 OAuth 콜백은 기존 Supabase Auth 콜백
`https://<project-ref>.supabase.co/auth/v1/callback`을 그대로 유지한다. Google이 앱
커스텀 스킴으로 직접 돌아오는 구조가 아니다.

## iOS 안전 영역

앱 셸은 `viewport-fit=cover`와 CSS safe area inset을 함께 사용한다. 상단 브랜드는
Dynamic Island와 상태 표시줄 아래에 배치하고, 하단 탭의 콘텐츠 높이는 유지한 채
홈 인디케이터 영역만 탭바 높이에 더한다. 탭바 위의 토스트와 팝오버도 같은 계산값을
기준으로 배치한다.

## 휴식 종료 알림

- 웹: 기존 Notification API와 포그라운드 소리를 유지한다.
- iOS/Android: 휴식 종료 시각을 OS에 예약한다.
- Android 상태 표시줄에는 `ic_stat_trainlog` 단색 심볼을 사용한다.
- 시간 조정, 타이머 중단, 운동 종료 시 같은 ID의 예약을 취소한다.
- 알림을 누르면 `/workout`으로 이동한다.
- Android 12 이상은 정확한 시각 알림을 위해 `알람 및 리마인더` 설정을
  요구할 수 있다.

권한 거부나 OS 플러그인 오류가 운동 기록 자체를 막지 않도록 알림 호출은
best-effort로 처리한다.

## 브랜드 자산 갱신

```bash
node scripts/build-brand-assets.mjs
npx @capacitor/assets@3.0.5 generate --android --ios \
  --iconBackgroundColor '#171717' --iconBackgroundColorDark '#171717' \
  --splashBackgroundColor '#171717' --splashBackgroundColorDark '#171717'
```

`resources/icon.png`과 `resources/splash.png`이 네이티브 자산의 원본이다.
