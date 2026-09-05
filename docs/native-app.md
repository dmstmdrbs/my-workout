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

현재 네이티브 범위는 앱 쉘, Google OAuth 딥링크, 로컬 알림, 기기 push 토큰
등록, 친구 운동 시작 outbox, APNs/FCM Edge Function 발송기까지다. 운영
자격정보는 앱 코드와 분리해 Supabase Function Secrets에만 저장한다.

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
Supabase client는 PKCE flow를 사용하고 커스텀 스킴에서는 `code`만
교환한다. 인증 도중 앱이 종료되어도 다음 냉간 시작에서 launch URL을
한 번 확인해 로컬 code verifier로 세션을 복원한다.

## iOS 안전 영역

앱 셸은 `viewport-fit=cover`와 CSS safe area inset을 함께 사용한다. 상단 브랜드는
Dynamic Island와 상태 표시줄 아래에 배치하고, 하단 탭의 콘텐츠 높이는 유지한 채
홈 인디케이터 영역만 탭바 높이에 더한다. 탭바 위의 토스트와 팝오버도 같은 계산값을
기준으로 배치한다.

## 휴식 종료 알림

- 운동 런타임은 공통 알림 어댑터만 호출하고, 실행 환경에 따라 웹 또는 네이티브
  구현을 선택한다. 플랫폼 API를 운동 상태 훅에서 직접 분기하지 않는다.
- 웹: 기존 Notification API와 포그라운드 소리를 유지한다.
- iOS/Android: 휴식 종료 시각을 OS에 예약한다.
- 앱이 열려 있으면 JS timer가 소리·햅틱을 보장하고, OS 알림은
  백그라운드 전달을 담당한다.
- Android 상태 표시줄에는 `ic_stat_trainlog` 단색 심볼을 사용한다.
- 시간 조정, 타이머 중단, 운동 종료 시 같은 ID의 예약을 취소한다.
- 알림을 누르면 `/workout`으로 이동한다.
- Android 12 이상은 정확한 시각 알림을 위해 `알람 및 리마인더` 설정을
  요구할 수 있다.

권한 거부나 OS 플러그인 오류가 운동 기록 자체를 막지 않도록 알림 호출은
best-effort로 처리한다.

## 친구 초대 링크

- 네이티브 컨테이너의 `localhost` 주소를 공유하지 않고 `VITE_PUBLIC_APP_URL`의
  공개 HTTPS 주소를 사용한다.
- 설치된 앱은 공개 도메인 또는 `trainlog://friends/invite/:token`으로 들어온
  초대 링크를 `/friends/invite/:token` 화면으로 연결한다.
- iOS Universal Link 자동 연결과 Android App Link 검증에는 출시 Team ID와
  릴리스 인증서 SHA-256 지문을 사용한 도메인 association 파일이 추가로 필요하다.

## 네이티브 영속 저장

- 운동 초안, 테마 미러, 휴식 알림 설정은 웹에서는 `localStorage`, 네이티브에서는
  Capacitor Preferences와 localStorage 미러에 함께 저장한다.
- 앱 시작 시 Preferences를 먼저 복원하며, 기존 앱에서 처음 업그레이드한 경우에는
  남아 있는 localStorage 값을 Preferences로 이관한다.
- 두 mirror에 revision과 삭제 tombstone을 남겨, 앱 종료 직전의 느린
  Preferences 쓰기가 최신 운동 초안을 되돌리거나 삭제한 초안을 복원하지 않는다.
- iOS의 `PrivacyInfo.xcprivacy`에는 UserDefaults 사용 사유 `CA92.1`을 선언한다.

## 앱 복귀와 데이터 갱신

- 네이티브 앱에서는 Capacitor App의 `appStateChange`를 TanStack Query의 focus 상태와
  연결한다. 백그라운드에서 돌아오면 stale 상태인 활성 쿼리를 다시 요청한다.
- 웹에서는 기존 정책대로 브라우저 탭 포커스만으로 자동 재요청하지 않는다.

## 운동 기록 이미지

- 웹에서는 기존 File Web Share 또는 PNG 다운로드를 사용한다.
- iOS/Android에서는 PNG를 앱 cache에 임시 저장해 OS 공유 시트에 전달한다. 사용자는
  공유 앱을 고르거나 시스템의 이미지·파일 저장 동작을 선택할 수 있다.
- 공유 시트가 닫히면 임시 파일을 정리하며, iOS privacy manifest에는 파일 timestamp
  사용 사유 `C617.1`을 선언한다.

## 운동 중 화면과 햅틱

- 웹에서는 Screen Wake Lock API를 유지하고, 네이티브에서는 Keep Awake 플러그인으로
  운동 초안이 있는 동안 화면이 꺼지지 않게 한다.
- 운동을 끝내거나 설정을 끄면 획득 중이던 네이티브 화면 잠금까지 해제한다.
- 네이티브 세트 완료에는 가벼운 impact, 휴식 종료에는 success notification 햅틱을
  사용한다. 웹 휴식 종료는 기존 Vibration API와 소리를 유지한다.

## 네이티브 대화상자와 키보드

- 로그아웃, 운동 취소, 프로그램 종료·갱신, 친구 삭제·차단은 네이티브에서
  Capacitor Dialog를 사용하고 웹에서는 기존 `window.confirm`을 유지한다.
- 브라우저 history의 동기 차단 계약에 묶인 저장 전 이탈 경고는 웹 대화상자를
  유지한다.
- 키보드가 열리면 WebView를 resize하고 하단 탭과 운동 재개 토스트를 잠시 숨겨
  마지막 입력 칸과 키보드가 겹치지 않게 한다.

## 운동 공백 리마인더

- 설정에서 기기별로 3일·5일·7일 리마인더를 켤 수 있다. 권한은 사용자가 기능을
  켜는 시점에만 요청한다.
- 마지막 완료 운동을 한 건만 조회하고 해당 시각에서 설정한 일수 뒤에 로컬 알림을
  예약한다. 이미 기준일이 지났다면 갑자기 울리지 않고 다음 오전 9시에 예약한다.
- 운동을 새로 완료하거나 주기를 바꾸거나 로그아웃하면 기존 ID의 예약을 취소한 뒤
  다시 계산한다. 웹에는 신뢰할 수 있는 예약 API가 없어 이 설정을 노출하지 않는다.

## 친구 운동 시작 push

- 네이티브 설정에서 사용자가 직접 켠 경우에만 Push Notifications 권한을 요청한다.
  등록된 APNs/FCM token은 `register_push_device` RPC로 현재 계정에 귀속하며,
  설정 해제와 로그아웃 시 서버·OS 등록을 함께 해제한다.
  같은 계정의 token 재등록은 기존 행 ID를 유지하고, 계정당 최대 5개까지 보존한다.
- 새 운동 초안을 시작하면 웹과 앱 모두 `announce_workout_started` RPC를 호출한다.
  복원된 초안은 새 시작으로 알리지 않으며 서버에서 사용자별 30분에 한 번으로 제한한다.
- DB trigger는 수락된 친구이면서 양방향 차단이 없고 등록 token이 있는 사용자만
  `push_notification_outbox`에 기기별로 넣는다. 세 테이블은 RLS를 켜고 publishable
  client의 직접 접근 권한을 제거했다.
- 알림을 누르면 허용된 `/friends` 경로만 앱 내부로 전달한다. Android는
  `friend-activity` 채널과 단색 아이콘을 사용한다.
- `send-friend-activity-push` Edge Function은 service role 전용 RPC로 최대 100개를
  5분 lease로 점유한다. 성공은 처리 완료, 429·5xx는 지수 backoff 재시도,
  영구 오류는 폐기, APNs/FCM이 무효하다고 판정한 token은 즉시 삭제한다.
- 대기열 점유 직전에 이번 발송 후보의 현재 친구·차단 관계를 다시 확인해,
  이미 친구를 삭제했거나 차단한 상대에게는 재시도 알림도 보내지 않는다.

출시 전 다음 운영 설정을 적용한다.

1. Android 앱 ID `app.trainlog.mobile`을 Firebase에 등록하고
   `android/app/google-services.json`을 빌드 환경에 제공한다.
2. Apple Developer의 App ID에서 Push Notifications를 활성화하고, 배포 서명과
   일치하는 APNs 키·Team ID·Key ID를 발송 환경에 제공한다.
3. Firebase Console > Project settings > Service accounts에서 발송용 JSON 키를
   발급하고 FCM HTTP v1 API를 활성화한다.

### Edge Function secrets·배포

로컬 파일에 아래 값을 준비하되 Git에는 추가하지 않는다.

```env
PUSH_DISPATCH_SECRET=<32자 이상 무작위 값>
FIREBASE_SERVICE_ACCOUNT_JSON=<Firebase service account JSON 전체>
APNS_KEY_ID=<Apple Key ID>
APNS_TEAM_ID=<Apple Team ID>
APNS_PRIVATE_KEY=<AuthKey_*.p8 전체>
APNS_TOPIC=app.trainlog.mobile
APNS_ENVIRONMENT=development
```

Debug 실기기는 `development`, TestFlight·App Store 배포는 `production`을 사용한다.
Android만 먼저 운영하려면 APNs 세 개 자격정보를 생략할 수 있고, iOS만
운영하려면 Firebase JSON을 생략할 수 있다. 설정되지 않은 플랫폼의 outbox는
점유하지 않고 그대로 보존한다.

```bash
npx supabase db push
npx supabase secrets set --env-file <Git 밖의 push-secrets.env>
npx supabase functions deploy send-friend-activity-push
```

Function은 Supabase gateway JWT 검증 대신 `x-trainlog-dispatch-secret` 헤더를 상수 시간으로
검사한다. `PUSH_DISPATCH_SECRET`이 없거나 32자 미만이면 작업을 시작하지 않는다.

### 1분 scheduler

Supabase Vault에 Function URL과 같은 dispatch secret을 저장한 뒤 `pg_cron` +
`pg_net`으로 1분마다 호출한다. `<...>` 부분은 운영 값으로 바꾼다.

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'trainlog_project_url'
);
select vault.create_secret(
  '<PUSH_DISPATCH_SECRET과 같은 값>',
  'trainlog_push_dispatch_secret'
);

select cron.schedule(
  'trainlog-friend-activity-push',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'trainlog_project_url')
           || '/functions/v1/send-friend-activity-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trainlog-dispatch-secret',
      (select decrypted_secret from vault.decrypted_secrets
       where name = 'trainlog_push_dispatch_secret')
    ),
    body := '{"limit": 50}'::jsonb
  );
  $$
);
```

재시도 5회를 모두 소진한 행은 `discarded_at`과 `last_error`를 확인해 원인을
조치한다. Cron·Vault 생성과 운영 secret 등록은 원격 상태를 바꾸므로 별도
승인 후 수행한다.

APNs 키, Firebase 서비스 계정, Supabase service role은 앱 번들·Vercel 프런트 환경
변수·Git에 넣지 않는다. Edge Function은 Supabase의 server-side secret만 사용하며
publishable client에서 claim·complete RPC를 실행할 수 없다. 이 값들이 없는
로컬/시뮬레이터에서는 push 등록 실패가 운동 시작을 막지 않는다.

## 브랜드 자산 갱신

```bash
node scripts/build-brand-assets.mjs
npx @capacitor/assets@3.0.5 generate --android --ios \
  --iconBackgroundColor '#171717' --iconBackgroundColorDark '#171717' \
  --splashBackgroundColor '#171717' --splashBackgroundColorDark '#171717'
```

`resources/icon.png`과 `resources/splash.png`이 네이티브 자산의 원본이다.
