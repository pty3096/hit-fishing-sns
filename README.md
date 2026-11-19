# 히트 HIT — 낚시 SNS 플랫폼

낚시 SNS 플랫폼의 기획·브랜드·UI 자료를 관리하는 저장소입니다.

> 현재 상태: 시범 접속 연결 복구 안내·대표 사진·사진 순서 변경·글 전송 중 편집 보호·프로필 사진 선택 취소·실패 복구·모바일 인증 입력 개선·가입·인증 후 작업 복귀·글·검색 공유 링크·댓글 수정·내 글 관리·공개 닉네임으로 낚시인 찾기·홈 화면 설치 준비·연결 실패 안내·지역별 낚시지도·장터 상품 게시판·커뮤니티·조황 랭킹·개인 저장·앱 안 알림, 계정·사진 조황·소통·운영 기능, 이메일 인증·비밀번호 재설정·프로필 사진을 연결하고 배포 파일을 준비했습니다. 현재는 개발용 메일함으로 검증하며 실제 메일 발송·공개 배포는 하지 않았습니다.
> 사용자가 다시 제공한 확정 UI v1.1 합성 시안을 기준으로 PC 홈·모바일 홈·프로필과 공통 물고기 로고를 반영했습니다. 개별 로고·사진·편집 원본과 과거 상세 설계는 미확보입니다.

## 앱 실행

Node.js 24에서 최초 한 번 `npm ci`로 필요한 패키지를 설치하고 `npm start`를 실행한 뒤 [로컬 앱](http://127.0.0.1:3000)을 엽니다. `npm test`로 핵심 동작을 검증합니다. 개발 환경에서는 Chrome 설치 후 `npm run test:browser`로 별도 테스트 자료를 사용하는 화면 검사를 실행합니다. [화면 검사 실행 방법](docs/31_BROWSER_QA.md)을 참고해주세요.

[이메일 인증과 개발용 메일함](docs/11_EMAIL_AUTH.md)을 먼저 확인해주세요. 기존 개발 계정도 인증 후 작성·소통 기능을 이용할 수 있습니다. [프로필 사진](docs/13_PROFILE_PHOTO.md)과 [배포 준비·백업](docs/12_DEPLOYMENT_PREP.md)도 정리했습니다. 실제 SMTP 연결·실사용 운영자 지정·공개 배포는 후속 작업입니다. 계정·조황·사진·메일·백업은 `data/`에 저장하며 GitHub에 올리지 않습니다.

## 자료

- [현재 구현·출시 준비 상태와 남은 직접 확인](docs/37_RELEASE_READINESS.md)

- [가입·이메일 인증 후 작업 복귀](docs/36_ONBOARDING_RESUME.md)

- [공유 링크 복사·직접 복사 안내](docs/35_SHARE_LINKS.md)

- [본인 댓글 수정·취소·재시도](docs/34_COMMENT_EDIT.md)

- [내 글 관리·종류별 검색·수정](docs/33_MY_POSTS.md)

- [조황·커뮤니티 제목·본문 검색](docs/32_POST_KEYWORDS.md)

- [브라우저 화면 검사·낚시인 찾기 검증](docs/31_BROWSER_QA.md)

- [낚시인 닉네임 검색·공개 범위](docs/30_PEOPLE_SEARCH.md)

- [장터 상품명·설명·가격 검색](docs/29_MARKET_SEARCH.md)

- [아이폰 홈 화면 설치·연결 안내](docs/28_HOME_SCREEN.md)

- [지역별 낚시지도·외부 지도 연결 범위](docs/27_REGION_MAP.md)

- [장터 상품 등록·가격·거래 상태](docs/26_MARKETPLACE.md)

- [인기 조황 랭킹·집계 기준](docs/25_RANKINGS.md)

- [커뮤니티 글쓰기·목록·권한](docs/24_COMMUNITY.md)

- [낚시 방식·출조 기간 검색](docs/23_SEARCH_FILTERS.md)

- [댓글·좋아요·팔로우 앱 안 알림](docs/22_NOTIFICATIONS.md)

- [개인 저장 목록](docs/21_SAVED_POSTS.md)

- [확정 UI v1.1 반영·차이와 검증](docs/20_APPROVED_UI.md)

- [댓글 전송 재시도](docs/19_COMMENT_RETRIES.md)

- [연결 오류 후 조황 등록 재시도](docs/18_POST_RETRIES.md)

- [아이폰용 보호된 시범 접속](docs/17_IPHONE_PREVIEW.md)

- [휴대폰 시범 사용 준비·점검표](docs/16_PHONE_TRIAL.md) · 로컬 접속 점검: `npm run check:local`

- [글 임시 저장·이어쓰기·이탈 안내](docs/15_DRAFTS.md)

- [모바일·PC 사용성 점검 및 수정](docs/14_USABILITY_QA.md)
- [프로필 사진 업로드·변경·삭제](docs/13_PROFILE_PHOTO.md)
- [이메일 인증·비밀번호 재설정](docs/11_EMAIL_AUTH.md)
- [배포 준비·백업·검증 상태](docs/12_DEPLOYMENT_PREP.md)
- [신고·차단·운영자 관리·탈퇴](docs/10_MODERATION_ACCOUNT.md)
- [사진·댓글·좋아요·팔로우](docs/09_PHOTOS_SOCIAL.md)
- [실제 앱 개발 기반과 검증 기록](docs/08_LOCAL_APP.md)
- [화면 연결 시연](prototype/index.html) · [화면 흐름과 구현 범위](docs/07_SCREEN_FLOW.md)
- [첫 버전 개발 범위·화면 목록](docs/06_MVP_SCOPE.md)
- [마스터 설계서](docs/01_MASTER_PLAN.md)
- [구축 매뉴얼](docs/02_BUILD_GUIDE.md)
- [사용자 매뉴얼](docs/03_USER_MANUAL.md)
- [브랜드·로고](docs/04_BRAND_GUIDE.md)
- [UI 디자인 v1.1](docs/05_UI_DESIGN_v1.1.md)
- [원본 출처 및 누락 목록](docs/SOURCE_STATUS.md)
- [변경 이력](docs/CHANGELOG.md)

## 디자인 파일

[로고 참고 원본](design/logo/reference-logo-crop.png)과 [모바일 홈 참고 원본](design/ui/v1.1/reference-mobile-home.png)을 보존했습니다. 두 이미지는 로고 통일 요청 이전에 첨부된 참고 자료이며, 확정본으로 간주하지 않습니다.

## 실행 상태

`public/`은 실제 앱 화면, `server/`는 API·데이터베이스, `tests/`는 검증 코드입니다. `prototype/`은 이전 단계의 메모리 시연 화면으로 실제 앱과 구분합니다. 공개 배포와 전체 MVP 구현은 아직 완료하지 않았습니다.

