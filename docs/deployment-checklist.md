# 배포 체크리스트 (2026-08-17)

이 문서는 밤사이 작업한 두 브랜치를 운영에 반영하는 절차입니다. **순서를 지켜야 합니다.**

## 먼저 알아야 할 것

**운영에서 운동 저장이 계속 실패하고 있었습니다.** 운동을 끝내면 "운동을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요."가 뜨는데, 네트워크와 무관한 코드 문제라 재시도해도 영원히 실패합니다.

원인: 운동 초안의 `id`는 운동을 **시작할 때** 브라우저에서 만들고, 서버에는 **끝낼 때 처음** 저장됩니다. 그런데 저장 코드가 "id가 있으면 이미 서버에 있는 기록"이라고 가정하고 UPDATE를 걸었습니다. 서버에 없는 id라 0행이 갱신되고, `.single()`이 그 시점에 에러를 냅니다.

이번 배포가 그것을 고칩니다. 다만 **DB 마이그레이션이 먼저 적용돼야** 효과가 있습니다.

## 왜 제가 배포를 못 했는지

- 앱이 쓰는 Supabase 프로젝트(`hiuypgocgbotogzdzitl`)가 제 접근 권한 밖입니다. `list_projects`에 보이는 `my-workout`은 이름만 같은 **다른 프로젝트**였고, 어제 그것을 복구한 건 제 착오였습니다(무해하지만 진단은 틀렸습니다).
- 마이그레이션이 프론트엔드보다 **먼저** 적용돼야 하는데, GitHub main에 Vercel 자동 배포가 걸려 있다면 제가 푸시하는 순간 순서가 깨집니다. 그 설정을 여기서 확인할 수 없어 푸시하지 않았습니다.

그래서 아래 절차만 실행하시면 됩니다.

---

## 1단계 — DB 마이그레이션 적용 (프론트보다 먼저)

적용할 파일 두 개입니다. Supabase 대시보드 → **SQL Editor**에 각 파일 내용을 붙여넣고 실행하시면 됩니다.

### 1-A. `supabase/migrations/20260816090000_atomic_writes.sql`

**비파괴적입니다.** 함수 두 개(`save_workout_session`, `save_routine`)를 만들 뿐 기존 데이터를 건드리지 않습니다. **이것이 저장 버그를 고치는 파일입니다.**

적용 후 확인:

```sql
select proname, prosecdef
from pg_proc
where proname in ('save_workout_session', 'save_routine');
```

`prosecdef`가 **`false`** 여야 합니다. `true`면 `security definer`로 만들어진 것이고 RLS를 우회하므로 잘못된 상태입니다.

PostgREST가 새 함수를 아직 모른다면 스키마 캐시를 갱신합니다:

```sql
notify pgrst, 'reload schema';
```

### 1-B. `supabase/migrations/20260817000000_body_measurement_unique.sql`

**⚠️ 이 파일은 행을 삭제합니다.** 같은 날짜에 중복 저장된 신체 측정 기록을 정리한 뒤 unique 제약을 겁니다. 제약을 걸려면 중복이 없어야 하기 때문입니다.

**적용 전에 무엇이 지워질지 먼저 확인하세요:**

```sql
select user_id, measured_on, count(*) as 중복수
from public.body_measurements
group by user_id, measured_on
having count(*) > 1
order by 중복수 desc;
```

결과가 비어 있으면 지워질 것이 없으니 그대로 적용하시면 됩니다. 행이 나오면 각 그룹에서 `updated_at`이 가장 최근인 것만 남고 나머지가 삭제됩니다.

**1-A와 마찬가지로 이 마이그레이션도 반드시 적용해야 합니다.** 신체 측정 저장 코드(`saveBodyMeasurement`의 `id` 없는 경로)가 이제 `on conflict (user_id, measured_on)`으로 upsert를 겁니다. 이 제약이 DB에 없으면 Postgres가 `42P10 - there is no unique or exclusion constraint matching the ON CONFLICT specification` 오류를 내고, 그날 첫 신체 측정 저장이 재시도해도 계속 실패합니다. 신체 측정을 쓰신 적이 없어도 이 마이그레이션은 안전하게 적용됩니다 — 지울 중복 행이 없으면 DELETE는 아무 일도 하지 않는 no-op이고, 제약 추가 자체에는 비용이 들지 않습니다.

---

## 2단계 — 프론트엔드 배포

1단계가 끝난 뒤에 진행합니다.

```bash
cd /Users/musc-le/orca/my-workout
git log --oneline -1        # 머지 결과 확인
git push origin main
```

Vercel이 GitHub에 연결돼 있으면 푸시로 자동 배포됩니다. 아니라면:

```bash
npx vercel deploy --prod --yes
```

`.vercel` 링크가 없는 상태라 CLI를 처음 쓰시면 프로젝트 연결을 한 번 물어봅니다.

---

## 3단계 — 배포 후 확인

**반드시 확인할 것:**

1. **운동을 끝까지 완료해 저장되는지.** 이번 배포의 핵심입니다. 기록 화면에 나타나야 합니다.
2. **같은 운동을 다시 저장했을 때 기록이 중복되지 않는지.** 두 번째 저장은 UPDATE 경로를 타야 합니다.
3. **루틴 편집 저장이 정상인지.** 같은 RPC 구조로 바뀌었습니다.

**여유 있을 때 확인할 것:**

4. 기록 화면을 스크롤해 다음 20개가 이어 붙는지, 끝에서 멈추는지.
5. 오래된 기록 주소로 직접 들어가도 상세가 열리는지.
6. 같은 날짜로 신체 측정을 두 번 저장했을 때 행이 하나로 유지되는지.
7. 모바일에서 하단 "더보기"를 눌러 메뉴가 **화면 하단에** 뜨는지. (스크롤한 상태에서도)
8. 다른 기기에서 테마를 바꾸고 이 기기에서 열었을 때 그 테마로 뜨는지.
9. 지난 기록이 있는 종목을 운동에 추가해 "지난 기록" 패널에 숫자가 뜨는지 확인하세요. 이 조회(`getLastCompletedSetForExercise`)는 실제 DB에서 실행된 적이 없고, 실패해도 조용히 삼켜져 "기록 없음"으로 보입니다 — 기록이 있는데도 "기록 없음"이 뜬다면 이 조회가 깨진 것입니다.

---

## 문제가 생기면

**저장이 여전히 실패하고 콘솔에 `PGRST202` 또는 "Could not find the function"이 보이면** — 1-A가 적용되지 않았거나 PostgREST 캐시가 갱신되지 않은 것입니다. `notify pgrst, 'reload schema';`를 실행해 보세요.

**`PGRST116 / The result contains 0 rows`가 그대로 보이면** — 1단계 없이 2단계만 나간 상태입니다. 마이그레이션을 적용하세요.

**신체 측정 저장에서 unique 위반 오류가 나면** — 1-B는 적용됐는데 프론트엔드가 옛 버전인 경우입니다. 2단계를 진행하세요.

**신체 측정 저장이 계속 실패하고 콘솔에 `42P10` 또는 "there is no unique or exclusion constraint matching the ON CONFLICT specification"이 보이면** — 1-B가 적용되지 않은 것입니다. 1단계로 돌아가 적용하세요.

되돌리려면 Vercel 대시보드에서 이전 배포로 롤백하시면 됩니다. 마이그레이션은 되돌릴 필요가 없습니다 — 1-A는 함수 추가라 옛 프론트엔드와 공존하고, 1-B의 제약은 옛 코드도 위반하지 않습니다.
