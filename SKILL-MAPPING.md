# 유튜브 블로그 스킬 매핑

이 폴더의 자동화는 **스포츠 블로그와 동일한 스킬 파일**을 직접 참조합니다.

## 사용 스킬

| 스킬 | 경로 | 역할 |
|------|------|------|
| sports-blog-writing | `/Users/irenedo/Desktop/Blog Automation/sports/.agents/skills/sports-blog-writing/SKILL.md` | 포메팅·구조·인용구 서론·VS 질문 |
| youtube-policy (이 폴더) | `socceryoutube-policy.md` | 유튜브 전용: 자막 출처, 출연자 언급 금지 |

## 적용되는 sports-blog-writing 핵심 규칙

- 서론: 첫 문장 질문형 인용구 + 빈 줄 + 본문 3줄
- 소제목: 정확히 3개, 번호 붙임, 짧고 후킹된 질문형
- closing: 핵심 요약 → 공감 → vs 질문 → CTA → 마무리
- VS 양자택일 질문은 자동으로 빨간색(#c62828) 볼드 처리됨

## 변경 시 주의

- `sports-blog-writing/SKILL.md`를 수정하면 **스포츠 블로그와 유튜브 블로그 둘 다 영향** 받음
- 유튜브에만 적용할 규칙은 `socceryoutube-policy.md`에 추가
- 기존 `socceryoutube-writing.md`는 `_deprecated/`로 이동됨 (참조 안 함)
