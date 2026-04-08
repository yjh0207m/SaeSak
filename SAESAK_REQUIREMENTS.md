# 🌱 새싹 (Saesak) 앱 요구사항 명세서 v2.0

> **"새로운 사랑이 싹트는 그곳, 새싹"**
> 지역 기반 오프라인 연계 데이트 앱 · 프로토타입 버전
> React Native CLI · Firebase · Git

---

## 📌 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 앱 이름 | 새싹 (Saesak) |
| 핵심 차별화 | 지역 기반 오프라인 연계 (근처 유저 탐색 · 데이트 코스 추천 · 소모임) |
| 타겟 사용자 | 전 연령대 |
| 수익 모델 | 코인/포인트 충전 · 지역 가게 광고 제휴 (프로토타입은 Mock) |
| 개발 목표 | 프로토타입 완성 후 추후 실서비스 확장 |
| GitHub | https://github.com/johyun123/SaeSak |

---

## 🛠️ 기술 스택

### Mobile (메인)
- **React Native CLI** (Expo 미사용 · 네이티브 레이어 직접 관리)
- React Navigation v6 (Stack + Bottom Tabs)
- Zustand (전역 상태 관리)
- react-native-deck-swiper (스와이프 UI)
- react-native-maps (지도)

### Backend (Firebase)
- **Firebase Authentication** (이메일/비밀번호 · 구글 로그인)
- **Cloud Firestore** (메인 DB · 실시간 리스너로 채팅 처리)
- **Firebase Storage** (프로필 사진 · 채팅 이미지)
- **Cloud Functions** (서버 로직 · FCM 트리거 · 매칭 알고리즘)
- **Firebase Cloud Messaging** (푸시 알림)

### 외부 API (무료 범위)
- Google Maps SDK (지도 표시)
- Google Places API (데이트 코스 추천 · 월 $200 무료 크레딧)
- Kakao SDK (카카오 로그인 · 무료 · 승인 불필요)
- Google Cloud Vision API (프로필 사진 모더레이션 · 1000회/월 무료)

### DevOps
- Git / GitHub (johyun123/SaeSak)
- Android Studio (에뮬레이터)
- VSCode + Claude for VSCode (개발 도구)
- Firebase Emulator Suite (로컬 개발)

### 프로토타입 제외 (배포 시 전환)
- 인앱 결제 → RevenueCat SDK
- 휴대폰 본인인증 → Firebase Phone Auth 또는 NICE
- 지도 → 카카오맵 SDK (국내 데이터 풍부)
- 신분증 인증 → 카카오/PASS (사업자 계약 필요)

---

## 📁 프로젝트 폴더 구조

```
SaeSak/
├── .env                          # Firebase 키 (절대 git push 금지)
├── .gitignore
├── android/                      # Android 네이티브 (RN CLI)
├── ios/                          # iOS 네이티브 (RN CLI)
├── src/
│   ├── config/
│   │   └── firebase.js           # Firebase 초기화
│   ├── screens/
│   │   ├── auth/                 # AUTH-01~05
│   │   │   ├── LoginScreen.js
│   │   │   ├── RegisterScreen.js
│   │   │   └── ProfileSetupScreen.js
│   │   ├── match/                # MATCH-01~04
│   │   │   ├── SwipeScreen.js
│   │   │   ├── MapScreen.js
│   │   │   └── FilterScreen.js
│   │   ├── chat/                 # CHAT-01~03
│   │   │   ├── ChatListScreen.js
│   │   │   ├── ChatRoomScreen.js
│   │   │   └── MeetingPlanScreen.js
│   │   ├── local/                # LOCAL-01~03
│   │   │   ├── DateCourseScreen.js
│   │   │   ├── EventScreen.js
│   │   │   └── EventDetailScreen.js
│   │   └── pay/                  # PAY-01~03 (Mock)
│   │       ├── CoinShopScreen.js
│   │       └── PremiumScreen.js
│   ├── components/               # 공통 컴포넌트
│   │   ├── ProfileCard.js
│   │   ├── SwipeCard.js
│   │   ├── ChatBubble.js
│   │   └── MeetingPlanCard.js
│   ├── store/                    # Zustand 스토어
│   │   ├── authStore.js
│   │   ├── matchStore.js
│   │   └── chatStore.js
│   ├── hooks/                    # 커스텀 훅
│   │   ├── useAuth.js
│   │   ├── useLocation.js
│   │   └── useMatching.js
│   └── utils/
│       ├── geoUtils.js           # 거리 계산 · 중간 지점
│       └── constants.js
├── App.js
└── package.json
```

---

## 🗃️ Firestore 컬렉션 구조

### `users/{uid}`
```
uid         (= Firebase Auth uid, PK)
email       string
provider    string  (google | email)
coin_balance  number  (기본값: 100)
is_premium  boolean (기본값: false)
is_blocked  boolean (기본값: false)
created_at  timestamp
```

### `profiles/{uid}`
```
nickname      string
gender        string  (male | female | other)
birth_year    number
bio           string
photos        string[]  (Storage URL 배열, 최대 3장)
hobby_tags    string[]  (최대 5개)
location      GeoPoint  (실제 위치)
location_fuzzy  GeoPoint  (퍼지 처리 위치 · 타 유저에게 노출)
activity_area   string  (활동 지역명)
completeness  number  (프로필 완성도 %)
updated_at    timestamp
```

### `swipes/{id}`
```
from_uid    string  (FK → users)
to_uid      string  (FK → users)
type        string  (like | pass | super)
created_at  timestamp

[복합 인덱스: from_uid + created_at]
```

### `matches/{id}`
```
user_ids      string[]  ([uid1, uid2])
status        string  (active | ended)
meeting_plan  object  (날짜 · 장소 · 상태)
safety_checked  boolean
created_at    timestamp

[서브컬렉션: messages/]
```

### `matches/{id}/messages/{id}`
```
sender_uid  string
type        string  (text | image | plan)
content     string
image_url   string  (optional)
plan        object  (optional · 약속 카드)
read_at     timestamp  (optional)
created_at  timestamp
```

### `events/{id}`
```
host_uid          string  (FK → users)
title             string
description       string
location          GeoPoint
location_name     string
hobby_tags        string[]
max_participants  number
participants      string[]  (uid 배열)
event_at          timestamp
created_at        timestamp
```

### `reports/{id}`
```
reporter_uid  string
target_uid    string
reason        string
message_id    string  (optional)
status        string  (pending | reviewed | resolved)
created_at    timestamp
```

---

## ✅ 기능 명세 (Feature ID 기준)

> 우선순위: Must → Should → Nice
> 🟡 Mock = 실제 API 없이 UI·로직 흐름만 구현

---

### 👤 AUTH — 인증 & 회원 관리

#### AUTH-01 · 구글 소셜 로그인 `Must` `Phase 1`
- Firebase Auth + Google OAuth
- 무료 · 승인 불필요 · 즉시 사용
- `@react-native-google-signin/google-signin` 라이브러리

#### AUTH-02 · 카카오 소셜 로그인 `Must` `Phase 1`
- Kakao SDK (무료 · 카카오 개발자 앱 등록만 필요)
- `react-native-kakao-login` 라이브러리
- 국내 타겟 핵심 로그인 수단

#### AUTH-03 · 이메일/비밀번호 로그인 `Must` `Phase 1`
- Firebase Auth 기본 제공
- Firebase Console에서 이미 활성화됨 ✅
- 테스트 계정 생성 용이 · 소셜 로그인 폴백

#### AUTH-04 · 프로필 설정 `Must` `Phase 1`
- 닉네임 · 생년월일 · 성별
- 사진 최대 3장 (Firebase Storage 업로드)
- 자기소개 (최대 200자)
- 취미 태그 선택 (전체 20개 중 최대 5개 선택)
- 활동 지역 텍스트 입력
- 완성도 % 계산 및 표시
- 완성도 80% 이상 → 매칭 노출 우선순위 상향

#### AUTH-05 · 휴대폰 인증 `Should` `Phase 1` 🟡 Mock
- 실제 SMS 발송 없이 고정 인증코드(000000)로 UI 구현
- 배포 시 Firebase Phone Auth 또는 NICE로 교체
- UI 흐름: 번호 입력 → 인증코드 입력 → 완료

---

### 💚 MATCH — 탐색 & 매칭

#### MATCH-01 · 스와이프 UI `Must` `Phase 1`
- `react-native-deck-swiper` 활용
- 좋아요(하트 버튼 · 우로 스와이프)
- 패스(X 버튼 · 좌로 스와이프)
- 슈퍼라이크(별 버튼 · 위로 스와이프) → 코인 1개 소모
- 스와이프 기록 Firestore `swipes` 컬렉션에 저장
- 양방향 like → 매칭 성립 → `matches` 문서 생성
- Undo(되돌리기) 1일 1회 무료

#### MATCH-02 · 매칭 알고리즘 `Must` `Phase 1`
- Cloud Functions로 처리
- 이미 스와이프한 유저 제외
- 거리(GeoPoint Haversine) 가중치 적용
- 취미 태그 겹침 수 가중치 적용
- 차단된 유저 자동 제외
- 결과 캐싱(Redis 없이 Firestore 서브컬렉션 활용)

#### MATCH-03 · 근처 유저 지도 탐색 `Must` `Phase 1`
- `react-native-maps` + Firebase GeoPoint
- 반경 설정 (1 · 5 · 10 · 30km)
- 타 유저에게는 `location_fuzzy`(퍼지 위치)만 노출
- 프라이버시: 정확 좌표 미노출
- 지도 마커 클릭 → 프로필 카드 미리보기

#### MATCH-04 · 필터링 `Must` `Phase 1`
- 나이 범위 슬라이더
- 거리 범위 선택
- 취미 태그 다중 선택
- Firestore 복합 인덱스 활용
- 필터 저장 (Zustand + AsyncStorage)

---

### 💬 CHAT — 채팅 & 커뮤니케이션

#### CHAT-01 · 1:1 실시간 채팅 `Must` `Phase 1`
- Firestore `onSnapshot` 실시간 리스너 (WebSocket 대체)
- 텍스트 메시지
- 이미지 전송 (Storage 업로드 후 URL 저장)
- 읽음 확인 (`read_at` timestamp)
- 메시지 길게 누르기 → 삭제 (본인 메시지만)
- 매칭 상태 `active`일 때만 채팅 가능

#### CHAT-02 · 푸시 알림 `Must` `Phase 1`
- Firebase Cloud Messaging (FCM) 무료 · 무제한
- Cloud Functions에서 트리거
- 알림 종류: 매칭 성립 · 새 메시지 · 약속 확정 · 안전 확인
- 시간대별 알림 ON/OFF 설정 (22:00~08:00 방해 금지 모드)

#### CHAT-03 · 오프라인 약속 카드 `Must` `Phase 1`
- 채팅창 내 약속 잡기 버튼
- 날짜 선택 (DatePicker)
- 장소 텍스트 입력 (Google Places Autocomplete)
- 상태: 제안 → 수락 → 확정 → 완료
- 약속 카드 UI (채팅 버블과 구분되는 카드 형태)
- 확정 2시간 후 안전 확인 알림 자동 발송 (LOCAL-03 연동)

---

### 📍 LOCAL — 지역 기반 오프라인 연계 (핵심 차별화)

#### LOCAL-01 · 데이트 코스 추천 `Must` `Phase 1`
- 두 사람 위치의 중간 지점 계산 (`geoUtils.js`)
- Google Places API로 반경 내 장소 검색
  - 카테고리: 카페 · 음식점 · 공원 · 영화관
- 장소 카드 리스트 (사진 · 이름 · 평점 · 거리)
- 카드 클릭 → Google Maps 연결
- 월 $200 무료 크레딧으로 프로토타입 충분

#### LOCAL-02 · 지역 이벤트 / 소모임 `Must` `Phase 1`
- Firestore `events` 컬렉션 기반
- 모임 개설: 제목 · 설명 · 날짜 · 장소 · 최대 인원(1~10명) · 취미 태그
- 모임 탐색: 내 위치 기반 거리순 · 취미 태그 필터
- 참여 신청 → 호스트 수락 플로우
- 참여자 목록 (프로필 썸네일)

#### LOCAL-03 · 안전 확인 알림 `Must` `Phase 1`
- 약속 확정 시 `meeting_plan.scheduled_at` 저장
- Cloud Functions 스케줄러: 약속 시간 + 2시간 후 FCM 발송
- "안전하신가요?" 확인 버튼
- 미응답 시 앱 내 경고 배너 표시
- 긴급 연락처 등록 기능 (선택)

---

### 💰 PAY — 수익 모델 (Mock 구현)

> 실제 결제 없이 UI와 로직 흐름만 완성.
> Firestore `coin_balance`, `is_premium` 필드로 가상 관리.
> 배포 시 RevenueCat SDK로 교체.

#### PAY-01 · 코인 충전 `Must` `Phase 1` 🟡 Mock
- 충전 화면: 패키지 선택 (100코인 · 300코인 · 1000코인)
- "충전하기" 버튼 → 실제 결제 없이 즉시 코인 추가
- 코인 사용처: 슈퍼라이크(1코인) · 부스트(10코인) · 되돌리기(5코인)
- 코인 잔액 헤더에 항상 표시
- 배포 시: RevenueCat + Apple IAP / Google Play Billing 연동

#### PAY-02 · 프리미엄 구독 `Must` `Phase 1` 🟡 Mock
- 구독 화면: 혜택 리스트 · 가격 표시 (월 9,900원 · 연 79,900원)
- 혜택: 무제한 좋아요 · 내 좋아요 목록 확인 · 광고 제거 · 추가 필터
- "구독하기" 버튼 → `is_premium: true` 즉시 활성화
- 구독 상태에 따른 기능 분기 처리 (`is_premium` 체크)
- 배포 시: RevenueCat 구독 상품 연동

#### PAY-03 · 지역 광고 배너 `Should` `Phase 2` 🟡 Mock
- 스와이프 피드 5장당 스폰서 카드 1개 삽입
- 더미 데이터로 카드 디자인 · 클릭 플로우 구현
- 클릭 → 외부 링크 또는 앱 내 상세 페이지
- 배포 시: 실제 지역 가게 제휴 + 월정액 광고 모델

---

### 🛡️ SAFE — 신고 & 안전

#### SAFE-01 · 신고 / 차단 `Must` `Phase 1`
- 프로필 · 메시지 단위 신고
- 신고 사유 선택 (부적절한 사진 · 욕설 · 스팸 · 기타)
- Firestore `reports` 컬렉션 저장
- 차단 즉시 적용 (Firestore Security Rules)
- 차단 시 스와이프 피드 · 채팅 목록에서 자동 제거
- 관리자 리뷰: Firebase Console 수동 처리 (프로토타입)

#### SAFE-02 · 프로필 사진 검토 `Should` `Phase 1`
- 사진 업로드 시 Google Cloud Vision API 호출
- SafeSearch 탐지: VERY_LIKELY 판정 시 자동 거부
- Cloud Functions에서 Storage 트리거로 처리
- 1000회/월 무료 → 프로토타입 충분

---

## 🚫 프로토타입 제외 항목

| 기능 | 제외 이유 | 배포 시 대응 |
|---|---|---|
| 휴대폰 본인인증 (NICE/KCB) | 유료 + 사업자 계약 필요 | Firebase Phone Auth / NICE |
| 신분증 스캔 | 유료 + 사업자 계약 필요 | 카카오/PASS API |
| Apple 로그인 | 연 $99 Developer 계정 | Apple Sign-In |
| 실 인앱 결제 | 앱스토어 심사 필요 | RevenueCat |
| 관리자 웹 대시보드 | 프로토타입 범위 초과 | React + Ant Design |
| 실시간 통계 | 프로토타입 범위 초과 | Firebase Analytics |
| 카카오맵 SDK | Google Maps로 대체 가능 | 배포 시 전환 |

---

## 📋 비기능 요구사항 (NFR)

| 항목 | 기준 |
|---|---|
| 성능 | 스와이프 피드 렌더링 지연 없음 · 채팅 메시지 딜레이 최소화 |
| 보안 | `.env` 키 분리 · Firestore Security Rules 필수 · 위치 퍼지 처리 |
| 프라이버시 | 정확 위치 미노출 · 타 유저에게 `location_fuzzy`만 공개 |
| 가용성 | Firebase 무료 플랜 한도 내 운영 |
| UX | 온보딩 5스텝 이내 · 다크모드 지원 |
| 법규 (배포 시) | 청소년보호법(만 18세 미만 차단) · 위치정보사업자 신고 · 전자상거래법 |

---

## 🗓️ 개발 마일스톤

### Phase 1 — 핵심 프로토타입 (6~8주)
```
Week 1~2: 환경 세팅 · Firebase 연결 · 인증(AUTH-01~04)
Week 3~4: 프로필 · 스와이프 UI · Firestore 매칭(MATCH-01~02)
Week 5~6: 채팅 · FCM 알림 · 약속 카드(CHAT-01~03)
Week 7~8: 근처 유저 지도 · Mock 결제 · 신고(MATCH-03, PAY-01~02, SAFE-01)
```

### Phase 2 — 오프라인 연계 강화 (4~5주)
```
데이트 코스 추천(LOCAL-01) · 소모임(LOCAL-02) · 안전 확인(LOCAL-03)
Cloud Vision 사진 검토(SAFE-02) · 광고 배너 Mock(PAY-03) · 필터 고도화
```

### Phase 3 — 배포 준비 전환 (별도 계획)
```
RevenueCat 실결제 · NICE 본인인증 · 카카오맵 전환
관리자 웹 · 성능 최적화 · 앱스토어 심사
```

---

## 💡 Claude for VSCode 활용 가이드

기능 ID를 프롬프트에 그대로 사용하면 컨텍스트 공유가 빠름.

```
# 예시 프롬프트
"AUTH-03 이메일/비밀번호 로그인 Firebase 연동 코드 짜줘.
 firebase.js 설정은 아래와 같아: [코드 붙여넣기]"

"MATCH-01 스와이프 UI 구현해줘.
 react-native-deck-swiper 쓰고 Firestore swipes 컬렉션에 저장해야 해."

"CHAT-01 Firestore onSnapshot으로 실시간 채팅 구현해줘.
 matches/{id}/messages 서브컬렉션 구조 써."

"LOCAL-01 두 사람 중간 지점 계산하고 Google Places API로 카페 추천해줘.
 geoUtils.js에 Haversine 공식 포함해서."
```

---

## ⚙️ Firebase 프로젝트 정보

```javascript
// src/config/firebase.js 에 적용할 설정
// 실제 키는 .env 파일로 분리할 것

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "saesakdateapp.firebaseapp.com",
  projectId: "saesakdateapp",
  storageBucket: "saesakdateapp.firebasestorage.app",
  messagingSenderId: "420359268221",
  appId: process.env.FIREBASE_APP_ID,
  measurementId: "G-1JYFM7FNR3"
};
```

### 활성화된 Firebase 서비스
- [x] Authentication (이메일/비밀번호)
- [x] Cloud Firestore
- [x] Firebase Storage
- [x] Firebase Cloud Messaging
- [ ] Cloud Functions (활성화 필요)
- [ ] Google 로그인 (Auth에서 추가 필요)

### .env 파일 구조
```
FIREBASE_API_KEY=your_api_key
FIREBASE_APP_ID=your_app_id
GOOGLE_PLACES_API_KEY=your_places_key
KAKAO_NATIVE_APP_KEY=your_kakao_key
```

---

*새싹 앱 요구사항 명세서 v2.0 · 최종 정리*
