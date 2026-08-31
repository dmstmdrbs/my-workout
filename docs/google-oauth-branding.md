# Google OAuth 브랜딩과 커스텀 도메인 적용 가이드

작성일: 2026-08-31
범위: Google 로그인 동의 화면, Vercel 앱 도메인, Supabase Auth 콜백 도메인

이 문서는 외부 서비스 설정을 직접 변경하지 않고, 현재 저장소와 운영 프로젝트를
읽기 전용으로 확인한 결과 및 실제 적용 순서를 기록한다. Google OAuth client secret,
Supabase secret key 같은 비밀값은 문서나 클라이언트 코드에 넣지 않는다.

## 결론

Google 로그인에서 사용자가 보는 이름과 로고는 Google Auth Platform의 **Branding**에서
설정하고 브랜드 검증 후 게시할 수 있다. 반면 Google이 피싱 방지를 위해 표시하는
요청/콜백 도메인은 앱 이름으로 바꿀 수 없다. 현재와 같은 Supabase 기본 도메인 대신
소유 도메인의 `auth.<도메인>`을 Supabase custom domain으로 연결해야 그 영역도 브랜드와
연결된 도메인으로 보이게 할 수 있다.

지금 즉시 `My Workout`만 OAuth 앱 이름으로 설정하면 안 된다. 현재 앱의 제목, PWA 이름,
로그인 로고, 문서와 초대 문구는 모두 `Trainlog`다. Google은 OAuth 이름이 홈페이지와 실제
앱의 정체성을 정확히 나타낼 것을 요구한다. 따라서 아래 둘 중 하나를 먼저 확정해야 한다.

1. 제품명을 **Trainlog**로 유지하고 OAuth 앱 이름도 `Trainlog`로 맞춘다.
2. TODO의 완료 조건대로 **My Workout**을 사용하려면 별도 제품명 변경 작업으로 앱 UI,
   PWA manifest, 공개 홈페이지, 개인정보처리방침과 로고 설명까지 같은 이름으로 맞춘 뒤
   OAuth Branding을 `My Workout`으로 제출한다.

이 결정 전에는 외부 OAuth Branding 검증을 제출하지 않는다.

## 현재 확인된 상태

| 항목 | 2026-08-31 현재 상태 | 근거/영향 |
| --- | --- | --- |
| 앱 브랜드 | `Trainlog` | `index.html`, PWA manifest, `BrandLogo`, README와 앱 문구가 모두 Trainlog다. |
| Google 로그인 구현 | Supabase `signInWithOAuth({ provider: 'google' })` | 로그인 후 복귀 주소는 현재 페이지 URL이며, 앱 코드에서 추가 Google scope를 지정하지 않는다. |
| 운영 앱 도메인 | `trainlog-psi.vercel.app` 하나 | 연결된 Vercel `trainlog` 프로젝트의 domains API를 읽기 전용 조회했다. 커스텀 도메인은 없다. |
| Supabase Auth 도메인 | 기본 프로젝트 도메인 사용 | 저장소는 `VITE_SUPABASE_URL`을 그대로 사용한다. custom domain 상태 조회는 현재 조직에 해당 유료 add-on 권한이 없다는 응답을 반환했다. |
| 공개 홈페이지 | 별도 페이지 없음 | `/`은 비로그인 사용자에게 로그인 카드만 보여준다. Google 심사용 기능 설명 홈페이지 요건을 충족한다고 보기 어렵다. |
| 개인정보처리방침/약관 | 없음 | 앱 라우트와 문서에 공개 개인정보처리방침 또는 이용약관 링크가 없다. 브랜드 검증 전 추가해야 한다. |
| 로고 후보 | `public/icon-192.png` | 192×192 PNG, 5,647 bytes로 Google 권장 조건(정사각형, 1MB 이하)에 맞는 후보이다. 실제 업로드 미리보기와 브랜드명 일치는 별도 확인한다. |
| Google Console 설정 | 확인하지 못함 | 현재 Audience, Branding 게시 상태, 등록 callback, scope는 저장소에서 알 수 없다. 계정 설정을 바꾸지 않고 대시보드에서 확인해야 한다. |

Supabase의 Google 로그인 기본 준비 scope는 `openid`, `userinfo.email`,
`userinfo.profile`이다. 현재 앱 코드는 추가 scope를 전달하지 않지만, Google Auth
Platform의 **Data Access**에 실제 등록된 scope가 이 세 개뿐인지는 배포 전 확인한다.
민감 또는 제한 scope가 추가되어 있으면 브랜드 검증과 별개의 데이터 액세스 검증이
필요할 수 있다.

## 사용자가 보게 되는 정보와 변경 가능 범위

| 로그인 표면 | 변경 방법 | 임의 변경 가능 여부 |
| --- | --- | --- |
| 앱 이름, 로고 | Google Auth Platform > Branding, 검증 후 Publish | 가능. 실제 제품 정체성과 일치해야 한다. |
| 사용자 지원 이메일 | Google Auth Platform > Branding | 가능. 실제로 확인하는 주소를 사용한다. |
| 홈페이지, 개인정보처리방침, 이용약관 | 소유 도메인에 공개 페이지를 만들고 Branding에 등록 | 가능. 외부 production 앱의 검증 준비에 필요하다. |
| 요청/콜백 도메인 | Supabase Auth custom domain을 `auth.<소유 도메인>`에 연결 | 도메인은 바꿀 수 있지만 텍스트를 서비스명으로 치환할 수는 없다. |
| Google 자체 보안 안내와 UI | Google이 렌더링 | 변경 불가. 앱 UI로 덮거나 숨기려 하지 않는다. |

Supabase도 기본 프로젝트 ID 도메인이 Google 화면에 노출된다고 명시하며, 피싱 식별성을
높이기 위해 `auth.example.com` 또는 `api.example.com` 형태의 custom domain을 권장한다.
Vercel의 앱 도메인과 Supabase Auth 도메인은 서로 다른 엔드포인트이므로 하나를 설정했다고
다른 하나가 자동 변경되지는 않는다.

권장 구조는 다음과 같다. 실제 도메인은 소유권과 제품명 결정을 마친 뒤 정한다.

```text
https://<소유 도메인>/             공개 홈페이지와 앱 (Vercel)
https://<소유 도메인>/privacy      개인정보처리방침
https://<소유 도메인>/terms        이용약관
https://auth.<소유 도메인>/auth/v1/callback  Google -> Supabase Auth callback
```

루트 도메인 대신 `app.<소유 도메인>`에 앱을 두어도 된다. 홈페이지, 정책 문서, OAuth
callback에 쓰는 모든 top private domain은 Google Auth Platform의 Authorized domains에
등록하고 Google Search Console에서 소유권을 검증한다.

## 사전 준비 체크리스트

- [ ] 정식 제품명을 `Trainlog` 또는 `My Workout` 중 하나로 확정한다.
- [ ] 등록자와 DNS를 관리할 수 있는 소유 도메인을 준비한다.
- [ ] Google Cloud project Owner 또는 Editor인 계정이 같은 도메인의 Search Console
      verified owner가 될 수 있는지 확인한다.
- [ ] 로그인 없이 접근 가능한 홈페이지를 만든다. 앱 이름, 기능, Google 로그인을 쓰는
      이유와 개인정보처리방침 링크가 보여야 하며 다른 도메인으로 redirect하면 안 된다.
- [ ] 같은 소유 도메인에 개인정보처리방침을 공개한다. Google에서 받는 기본 프로필
      정보(식별자, 이메일, 이름, 프로필 사진), 사용 목적, 저장 위치/기간, 공유 여부,
      삭제·문의 방법을 실제 구현과 일치하게 설명한다.
- [ ] 이용약관을 공개하고 홈페이지에서 연결한다. 검증 화면에서 선택 항목으로 보이는
      경우에도 production 공개에 앞서 함께 제공하는 편이 안전하다.
- [ ] 사용자 지원 이메일과 개발자 연락 이메일을 실제로 모니터링한다.
- [ ] OAuth 로고는 정사각형 PNG로 준비하고 업로드 미리보기에서 잘림을 확인한다.
- [ ] Google Auth Platform > Data Access에서 `openid`, email, profile 외 scope가 없는지
      확인한다. 불필요한 client와 scope는 검증 제출 전에 제거한다.
- [ ] Audience가 Internal, External Testing, External Production 중 무엇인지 확인한다.
      소비자용 공개 앱이면 일반적으로 External Production이 대상이다. Testing은 최대
      100명의 명시적 test user로 제한되고 test authorization은 7일 후 만료된다.

## 안전한 적용 순서

### 1. 공개 앱 도메인과 정책 페이지 준비

1. Vercel `trainlog` 프로젝트에 소유 도메인을 추가한다.
2. Vercel이 프로젝트별로 제시하는 DNS 값을 확인한다. apex는 A record, subdomain은
   CNAME이 일반적이지만 고정값을 문서에서 복사하지 말고 대시보드 또는
   `vercel domains inspect <domain>` 결과를 따른다.
3. DNS verification과 SSL 발급을 확인하고 새 도메인에서 production 앱을 연다.
4. 기존 `trainlog-psi.vercel.app` 접근을 유지하되 canonical 도메인으로 redirect할지
   결정한다. 로그인 callback 전환이 끝나기 전에는 기존 주소를 제거하지 않는다.
5. 공개 홈페이지, `/privacy`, `/terms`를 로그인 없이 열어 검토한다.

이 단계는 별도 코드 PR과 실제 법적/운영 내용 검토가 필요한 후속 작업이다. 빈 템플릿이나
사실과 다른 정책 문구로 검증만 통과하려 하지 않는다.

### 2. Supabase 로그인 복귀 URL 정리

1. Supabase Dashboard > Authentication > URL Configuration의 Site URL을 새 production
   앱 URL로 설정한다.
2. Redirect URLs에는 production의 정확한 URL/path를 우선 등록하고 필요한 로컬 개발
   URL을 별도로 둔다. production에 광범위한 wildcard를 사용하지 않는다.
3. 현재 코드는 로그인 당시 `window.location.href`로 돌아오므로 `/friends/invite/...`처럼
   실제 로그인 진입 가능 경로가 allow list에 포함되는지 확인한다.
4. 시크릿 창에서 루트와 깊은 링크 로그인을 각각 테스트한다.

### 3. Supabase Auth custom domain 준비 및 전환

현재 조직은 custom domain add-on 권한이 없어 이 단계 전에 Supabase 유료 plan과 add-on
결정이 필요하다. 이는 비용/계정 변경이므로 별도 사용자 승인을 받아야 한다.

1. `auth.<소유 도메인>` 같은 subdomain을 정한다. Supabase custom domain은 현재 CNAME
   기반 subdomain 하나만 프로젝트에 연결할 수 있으며 frontend 호스팅 용도가 아니다.
2. Supabase Dashboard의 Project Settings > General > Custom Domains 절차를 사용하거나,
   최신 CLI `domains` 도움말을 확인한 뒤 hostname을 생성한다.
3. Supabase가 발급한 CNAME/TXT 검증 record를 DNS에 추가하고 인증서 발급을 확인한다.
4. **활성화 전에** Google Auth Platform > Clients의 Web client에 새 callback
   `https://auth.<소유 도메인>/auth/v1/callback`을 기존 Supabase callback과 함께 추가한다.
5. 새 callback이 등록된 것을 확인한 뒤 Supabase custom domain을 활성화한다. 활성화 즉시
   Supabase Auth가 OAuth provider에 새 callback 도메인을 알리므로 순서를 바꾸면 로그인이
   중단될 수 있다.
6. Vercel Production의 `VITE_SUPABASE_URL`을 새 Supabase custom domain으로 바꾸고
   재배포한다. publishable key는 그대로 사용하며 secret/service-role key를 넣지 않는다.
7. 신규 로그인, 기존 세션 갱신, 로그아웃, 깊은 링크 복귀를 확인한다. Supabase 기본
   프로젝트 도메인은 계속 동작하므로 검증 완료 전 기존 Google callback을 삭제하지 않는다.

### 4. Google OAuth Branding 구성

1. Google Auth Platform > Branding에서 확정된 앱 이름, 지원 이메일과 로고를 입력한다.
   `My Workout`을 선택했다면 앱과 홈페이지도 이미 같은 이름이어야 한다.
2. homepage, privacy policy, terms URL을 입력하고 top private domain을 Authorized domains에
   등록한다.
3. 같은 Google 계정이 Cloud project의 Owner/Editor이면서 Search Console의 verified
   owner인지 확인한다.
4. Audience와 publishing status를 확인한다. 외부 공개라면 production 전환 조건을 따른다.
5. Data Access에서 실제 요청 scope와 등록 scope가 일치하는지 확인한다.
6. Branding의 Verify Branding을 실행한다. 이름, 로고, URL 또는 authorized domain을
   바꾸면 새 draft 검증이 필요할 수 있다.
7. 승인된 branding을 Publish한다. Google의 현재 안내상 승인 후 7일 안에 게시해야 검증
   상태를 유지할 수 있다.

### 5. 출시 전 검증

- [ ] 로그아웃한 시크릿 창에서 Google 로그인 화면에 확정 앱 이름과 로고가 보인다.
- [ ] 보안상 표시되는 요청 도메인이 낯선 프로젝트 ID가 아니라
      `auth.<소유 도메인>`으로 보인다.
- [ ] Google이 표시하는 도메인/보안 문구가 남는 것은 정상이며 이름으로 치환하려 하지 않는다.
- [ ] 홈페이지와 개인정보처리방침이 로그인 없이 열리고 서로 링크된다.
- [ ] Google callback 후 원래 Trainlog 경로로 돌아오며 세션이 유지된다.
- [ ] 새 사용자와 기존 사용자의 로그인·로그아웃을 모두 확인한다.
- [ ] 브라우저 network/source와 Vercel 산출물에 OAuth client secret, service-role key,
      계정 정보가 포함되지 않는다.
- [ ] Google Auth Platform의 Published Branding 상태와 Verification Center 결과를 캡처해
      운영 기록에 남긴다. 캡처에는 client secret이나 계정 개인정보를 포함하지 않는다.

## 완료 조건 판정

| TODO 완료 조건 | 현재 판정 | 완료로 바뀌는 기준 |
| --- | --- | --- |
| OAuth 동의 화면에 `My Workout` 이름과 로고 | 미완료 | 제품명 불일치를 해소하고 Google Branding 검증·게시 후 실제 로그인 화면에서 확인 |
| 낯선 기본 도메인 노출을 가능한 범위에서 제거 | 미완료 | Vercel 앱 custom domain + Supabase Auth custom domain 적용 후 실제 흐름 확인 |
| 브랜드 인증 필요 여부와 후속 조치 문서화 | 완료 | 이 문서. 단, Console의 현재 Audience/scope/검증 상태는 계정에서 추가 확인 필요 |

## 공식 자료

- [Google OAuth 앱 브랜딩 관리](https://support.google.com/cloud/answer/15549049?hl=en)
- [Google 브랜드 검증 준비 및 제출](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google OAuth 2.0 정책](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google OAuth 앱 Audience 관리](https://support.google.com/cloud/answer/15549945?hl=en)
- [Supabase Google 로그인 설정](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Custom Domains](https://supabase.com/docs/guides/platform/custom-domains)
- [Vercel custom domain 설정](https://vercel.com/docs/domains/set-up-custom-domain)
