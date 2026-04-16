import { mountSession } from './session';
import { mountJournal } from './journal';
import { mountHistory } from './history';
import { ensureAuth } from './auth';
import { getUserGoals, getUserPreferences } from './api';
import { mountOnboarding } from './onboarding';
const app = document.getElementById('app');
let cachedPreferences = null;
let cachedGoals = null;
function render(view, opts) {
    app.innerHTML = '';
    if (view === 'onboarding') {
        mountOnboarding(app, {
            initialPreferences: cachedPreferences ?? undefined,
            initialGoals: cachedGoals ?? undefined,
            editing: opts?.editing,
            onDone: async () => {
                cachedPreferences = await getUserPreferences().catch(() => cachedPreferences);
                cachedGoals = await getUserGoals().catch(() => cachedGoals);
                render('session');
            },
        });
    }
    else if (view === 'session') {
        mountSession(app, cachedPreferences ?? undefined, cachedGoals ?? undefined, (sessionId) => {
            render('journal', { sessionId });
        }, () => render('history'));
    }
    else if (view === 'journal') {
        mountJournal(app, opts?.sessionId, () => {
            render('session');
        });
    }
    else if (view === 'history') {
        mountHistory(app, () => render('session'), () => render('onboarding', { editing: true }));
    }
}
// アプリ起動: 認証確認してからrender
ensureAuth().then(async (ok) => {
    if (!ok)
        return;
    cachedPreferences = await getUserPreferences().catch(() => null);
    cachedGoals = await getUserGoals().catch(() => null);
    if (!cachedPreferences?.onboarding_completed) {
        render('onboarding');
        return;
    }
    render('session');
    // ok=falseはリダイレクト中なので何もしない
});
