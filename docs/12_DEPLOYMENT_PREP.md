# 배포 준비

현재 결과물은 로컬 검증과 배포 파일 준비입니다. 도메인·서버·메일 발송 서비스는 아직 없으며, 실제 인터넷 서비스로 배포하지 않았습니다.

## 준비한 구성

- Node.js 24 기반 실행 이미지와 빌드 시 자동 테스트
- Caddy HTTPS 프록시 + 앱 + 영구 데이터 볼륨을 사용하는 Docker Compose
- 운영 설정 검증, HTTPS 쿠키·HSTS, 개발용 메일함 비활성화
- 상태 확인 API `/api/health`
- 실행 중 데이터베이스 백업과 무결성 검사 명령
- GitHub 자동 테스트·이미지 빌드·프록시 설정 확인·운영 컨테이너 기동 검사

이미지에는 개발 계정·조황·사진·백업·비밀 환경 파일을 넣지 않습니다. 배포할 때 새로운 빈 데이터 볼륨으로 시작합니다. SQLite를 쓰는 단일 서버 구성으로, 여러 앱 인스턴스를 띄워 공유하는 구조가 아닙니다.

## 로컬 설정

기본값으로 `npm start`가 실행됩니다. 변경이 필요하면 `.env.example`을 `.env`로 복사하고 수정합니다. `.env` 및 실제 운영 환경 파일은 저장소에서 제외됩니다.

## 운영 연결 후 실행할 절차

도메인을 서버에 연결하고, SMTP 서비스의 발신 주소를 등록한 뒤 다음과 같이 준비합니다. 아래는 실행 절차이며 현재 실행한 기록이 아닙니다.

1. 서버에 Docker Engine과 Compose를 준비하고 이 저장소를 가져옵니다.
2. 프로젝트 루트에 `.env.production`을 만들고 `deploy/production.env.example`의 항목을 실제 값으로 설정합니다. `APP_ORIGIN=https://도메인`과 `SITE_DOMAIN=도메인`을 일치시킵니다.
3. 외부 접속은 Caddy의 80·443 포트만 사용합니다. 앱의 3000 포트는 공개하지 않습니다.
4. 다음 명령으로 실행합니다.

```sh
docker compose --env-file .env.production -f deploy/compose.yaml up --build -d
```

5. `https://도메인/api/health`가 정상인지, 회원가입 메일이 실제로 도착하고 인증·재설정이 되는지 확인합니다.
6. 실제 운영자 계정을 가입·인증한 뒤 다음 명령으로 지정합니다. 예시 이메일을 실제 계정으로 바꿉니다.

```sh
docker compose --env-file .env.production -f deploy/compose.yaml exec app npm run admin -- grant you@example.com
```

운영 모드에서는 공개 HTTPS 주소·영구 DB 경로·SMTP 설정이 없으면 시작하지 않습니다. 메일 발송 정보는 서버의 환경 파일에만 입력하며 채팅이나 GitHub에 올리지 않습니다.

Compose의 `TRUST_PROXY=1`은 직접 외부에 노출하지 않는 앱이 Caddy가 넘겨주는 주소를 요청 제한에 사용하도록 하는 설정입니다. 프록시 없이 앱을 직접 공개하는 구성에는 이 값을 사용하지 않습니다.

## 백업·복원

로컬:

```sh
npm run backup
```

운영 컨테이너:

```sh
docker compose --env-file .env.production -f deploy/compose.yaml exec app npm run backup
```

기본 백업은 데이터 디렉터리의 `backups/`에 만듭니다. SQLite 백업 API로 일관된 사본을 만들고 무결성을 검사합니다. 기존 파일을 덮어쓰지 않습니다. 같은 디스크의 백업만으로 서버 손실에 대비할 수 없으므로 별도 보관 위치와 보존 기간은 운영 환경 결정 후 연결해야 합니다.

복원은 서버를 종료한 상태에서 백업 사본을 새 데이터 경로에 복사하고 `HIT_DB`를 그 경로로 지정하는 방식으로 확인합니다. 기존 데이터 파일에 실행 중 덮어쓰지 않습니다. 자동 테스트에서는 백업 사본으로 앱을 다시 열어 로그인·인증 상태 유지와 무결성을 검증했습니다.

## 현재 검증 상태 — 0.27.0

- DB 스키마는 11이며 기존 자료를 보존합니다. 이번 단계에는 DB 변경이 없습니다.
- 자동 검사 57개·Chrome 화면 검사 14개 및 로컬 연결 점검이 통과했습니다.
- GitHub에서는 자동 검사·화면 검사 후 Docker 이미지 빌드·Caddy 설정·메일을 보내지 않는 운영 컨테이너 점검을 실행합니다. 버전별 실제 결과는 Actions에서 확인합니다.
- 이 PC의 Docker 실행은 검증하지 않았습니다. CI의 컨테이너 점검은 실제 운영 서버 배포와 구분합니다.
- 앱 자체 인증은 개발용 메일함에서 검증했습니다. 실제 SMTP 발송·운영 도메인 HTTPS·공개 배포는 미실행입니다.
- PC·모바일 공통 물고기 로고와 UI는 사용자가 다시 제공한 확정 v1.1 합성 시안 기준입니다. 개별 고해상도·벡터·편집 원본은 미확보입니다.
- 실제 아이폰 Safari의 키보드·사진 선택·홈 화면 설치와 보호된 시범 접속은 사용자 기기 확인이 남아 있습니다.

공개 서비스 전에는 서버·도메인·메일 발송 계정 연결, 백업 외부 보관·운영 담당자·이용 정책·개인정보 처리방침 확정 후 실제 운영 환경에서 다시 검증해야 합니다. 이 항목은 완료했다고 표시하지 않습니다. [출시 준비 상태](37_RELEASE_READINESS.md)를 참고해주세요.

구성 참고: [Docker 빌드](https://docs.docker.com/build/building/best-practices/), [Compose 서비스](https://docs.docker.com/reference/compose-file/services/), [Caddy 요청 크기 제한](https://caddyserver.com/docs/caddyfile/directives/request_body).
