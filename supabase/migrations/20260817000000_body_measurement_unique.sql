-- 같은 날짜 중복을 DB가 막는다.
-- 제약 추가 전에 기존 중복을 정리한다. 하나라도 남아 있으면 제약 추가가
-- 실패해 마이그레이션 전체가 롤백된다.
-- 같은 (user_id, measured_on) 그룹에서 updated_at이 가장 최근인 행만 남긴다.
-- (updated_at, id) 복합 비교라 updated_at이 동률이어도 정확히 한 행만 남는다.

delete from public.body_measurements a
using public.body_measurements b
where a.user_id = b.user_id
  and a.measured_on = b.measured_on
  and (a.updated_at, a.id) < (b.updated_at, b.id);

alter table public.body_measurements
  add constraint body_measurements_owner_date_key unique (user_id, measured_on);

-- 제약이 만드는 인덱스와 중복되므로 기존 인덱스를 제거한다.
drop index if exists public.body_measurements_owner_date_idx;
