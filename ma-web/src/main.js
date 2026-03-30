import { mountSession } from './session';
import { mountJournal } from './journal';
import { mountHistory } from './history';
import { ensureAuth } from './auth';
const app = document.getElementById('app');
function render(view, opts) {
    app.innerHTML = '';
    if (view === 'session') {
        mountSession(app, (sessionId) => {
            render('journal', { sessionId });
        }, () => render('history'));
    }
    else if (view === 'journal') {
        mountJournal(app, opts?.sessionId, () => {
            render('session');
        });
    }
    else if (view === 'history') {
        mountHistory(app, () => render('session'));
    }
}
// アプリ起動: 認証確認してからrender
ensureAuth().then(ok => {
    if (ok)
        render('session');
    // ok=falseはリダイレクト中なので何もしない
});
