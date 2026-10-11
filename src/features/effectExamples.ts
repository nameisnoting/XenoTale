export const effectExamples = [
  {
    name: '공포 노이즈',
    content: `<style>
.noise{position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,#ffffff18 3px 4px);pointer-events:none;animation:noise .15s steps(2) infinite}
.warning{position:fixed;inset:0;display:grid;place-items:center;color:#fff;font-size:clamp(24px,5vw,60px);text-shadow:3px 0 #f55,-3px 0 #5fddce;animation:warning 1.2s steps(2) both}
@keyframes noise{50%{transform:translateY(4px);opacity:.35}}
@keyframes warning{0%,100%{opacity:0}20%,70%{opacity:1}}
</style>
<div class="noise"></div><div class="warning">뒤를 돌아보지 마세요.</div>
<script>
XenoTale.ready.then(() => XenoTale.screen('glitch', 1800));
setTimeout(() => XenoTale.close(), 2200);
</script>`,
  },
  {
    name: '열쇠 퍼즐',
    content: `<style>
main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#101818;padding:80px 24px 120px;text-align:center}
input,button{font:inherit;padding:12px 20px;border:1px solid #838383;border-radius:4px;background:#292929;color:#fff}
button{background:#fff;color:#222}#message{max-width:480px}
</style>
<main><h1>잠긴 문</h1><p>쪽지에는 ‘둘, 넷, 여섯’이라고 적혀 있다.</p>
<label>세 자리 비밀번호 <input id="answer" inputmode="numeric" maxlength="3" autocomplete="off"></label>
<button id="submit">잠금 해제</button><p id="message" role="status"></p></main>
<script>
let attempts = 0;
document.getElementById('submit').onclick = async () => {
  const message = document.getElementById('message');
  attempts++;
  if (document.getElementById('answer').value !== '246') { message.textContent = '맞지 않는다. 다시 살펴보자.'; return; }
  const button = document.getElementById('submit');
  button.disabled = true;
  try {
    await XenoTale.complete({ outcome: 'success', summary: '자물쇠 퍼즐을 풀었다. 잠긴 문을 열 방법을 알아냈다.', score: Math.max(0, 100 - (attempts - 1) * 10), data: { attempts } });
    message.textContent = '성공! 결과가 전달되었습니다. 닫고 다음 대화를 이어가세요.';
  } catch (error) { message.textContent = error.message; button.disabled = false; }
};
</script>`,
  },
];
