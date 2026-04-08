# 새싹 앱 오늘 구현 계획 — 2026-04-08

## 목표
**AUTH-02 카카오 로그인 완성 → AUTH-04 프로필 설정 완성**

---

## 1. AUTH-02 · 카카오 로그인 완성 `오늘`

### 발견된 버그
| 번호 | 파일 | 문제 | 수정 |
|------|------|------|------|
| 1 | `LoginScreen.tsx` | `auth/invalid-credential`은 "유저 없음"과 "비밀번호 틀림" 양쪽에서 발생 → 기존 유저에게도 신규 계정 생성 시도할 수 있음 | try create → catch `email-already-in-use` → signIn 순서로 변경 |
| 2 | `LoginScreen.tsx` | 함수 내부 `const email`이 외부 state `email`을 shadow → 가독성·유지보수 위험 | `kakaoEmail` / `kakaoPassword`로 명명 변경 |

### 확인된 정상 항목
- `import KakaoUser from '@react-native-kakao/user'` → default export 존재 ✅
- `App.tsx` `initializeKakaoSDK(KAKAO_NATIVE_APP_KEY)` ✅
- `AndroidManifest.xml` `AuthCodeHandlerActivity` + scheme `kakaof8a7898929b5397c53762e60482e795e` ✅
- `android/build.gradle` Kakao Maven repo ✅

### 수정 내용
- `LoginScreen.tsx` `handleKakaoLogin` 로직 개선

---

## 2. AUTH-04 · 프로필 설정 완성 `오늘`

### 체크할 항목
- [ ] `ProfileSetupScreen.tsx` 사진 업로드 → Firebase Storage 실제 동작
- [ ] Firestore `profiles/{uid}` 문서 생성 확인
- [ ] `completeness` % 계산 로직
- [ ] 완성 후 MainTabs로 네비게이션

---

## 내일 이후 (참고)
- MATCH-01 스와이프 UI (`react-native-deck-swiper` 연동)
- MATCH-02 매칭 알고리즘 (Firestore 쿼리 기반)
- CHAT-01 실시간 채팅 (`onSnapshot`)
