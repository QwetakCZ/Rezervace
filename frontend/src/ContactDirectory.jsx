import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

const PAGE_SIZE = 30;
const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nameOf = (contact) => `${contact.firstName} ${contact.lastName}`.trim() || 'Kontakt bez jména';
const dateOf = (value) => value ? new Date(value.replace(' ', 'T')).toLocaleDateString('cs-CZ') : '—';

export default function ContactDirectory({ onOpenLogs }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [group, setGroup] = useState('registered');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [composer, setComposer] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    api.getDirectory().then((data) => { if (active) setContacts(data.contacts || []); })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setPage(1); }, [search, group]);

  async function refresh() {
    setLoading(true); setLoadError('');
    try {
      const data = await api.getDirectory();
      setContacts(data.contacts || []);
      setSelected((ids) => ids.filter((id) => data.contacts.some((contact) => contact.id === id && contact.canEmail)));
    } catch (error) { setLoadError(error.message); }
    finally { setLoading(false); }
  }
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const recipients = useMemo(() => contacts.filter((contact) => selectedSet.has(contact.id)), [contacts, selectedSet]);
  const emails = useMemo(() => [...new Set(recipients.map((contact) => contact.email))].sort(), [recipients]);
  const filtered = useMemo(() => {
    const query = normalize(search).trim();
    return contacts.filter((contact) => contact.registered === (group === 'registered') &&
      (!query || normalize(`${nameOf(contact)} ${contact.email} ${contact.phone}`).includes(query)));
  }, [contacts, group, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const eligible = visible.filter((contact) => contact.canEmail);
  const allVisibleSelected = eligible.length > 0 && eligible.every((contact) => selectedSet.has(contact.id));
  const locked = sending || Boolean(attempt);
  const tooMany = emails.length > 100 || recipients.length > 300;

  function toggle(id) {
    setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
    setReview(false); setSendError('');
  }
  function toggleVisible() {
    const ids = new Set(eligible.map((contact) => contact.id));
    setSelected((current) => allVisibleSelected ? current.filter((id) => !ids.has(id)) : [...new Set([...current, ...ids])]);
    setReview(false); setSendError('');
  }
  function newMessage() {
    setComposer(true); setReview(false); setAttempt(null); setResult(null); setSubject(''); setMessage(''); setSendError('');
  }
  function preview(event) {
    event.preventDefault(); setSendError('');
    if (!emails.length || tooMany) return;
    if (!subject.trim() || !message.trim()) { setSendError('Vyplňte předmět i text zprávy.'); return; }
    setReview(true);
  }
  async function send() {
    if (sending) return;
    const payload = attempt || { requestId: crypto.randomUUID(), contactIds: recipients.map((contact) => contact.id), subject: subject.trim(), message: message.trim() };
    setAttempt(payload); setSending(true); setSendError('');
    try {
      const response = await api.sendDirectoryEmail(payload);
      setResult(response); setComposer(false); setSelected([]); setAttempt(null); setReview(false);
    } catch (error) {
      setSendError(error.message);
      if (error.deliveryStarted === false) { setAttempt(null); setReview(false); }
    }
    finally { setSending(false); }
  }

  return <section className="dashboardCard directorySection">
    <div className="dashboardCardHeader"><div><h2>Adresář hráčů a hostů</h2><p className="muted">Kontakty pouze z vašeho klubu. Vyberte příjemce a napište jim provozní zprávu.</p></div>
      <button className="ghostBtn" type="button" disabled={loading || locked} onClick={refresh}>{loading ? 'Načítám…' : 'Obnovit'}</button></div>
    <div className="directoryFilters">
      <div className="reservationViewSwitch" role="tablist" aria-label="Skupina kontaktů">
        <button type="button" role="tab" aria-selected={group === 'registered'} className={group === 'registered' ? 'reservationViewSwitch__active' : ''} onClick={() => setGroup('registered')}>Registrovaní hráči ({contacts.filter((c) => c.registered).length})</button>
        <button type="button" role="tab" aria-selected={group === 'guests'} className={group === 'guests' ? 'reservationViewSwitch__active' : ''} onClick={() => setGroup('guests')}>Neregistrovaní / hosté ({contacts.filter((c) => !c.registered).length})</button>
      </div>
      <label className="directorySearch">Hledat kontakt<input className="field" type="search" placeholder="Jméno, e-mail nebo telefon" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <p className="muted">{group === 'registered' ? 'Hráči s aktivním účtem, kteří se mohou přihlásit.' : 'Kontakty bez aktivního účtu a údaje dalších osob z rezervací. Stejný rodinný e-mail může patřit více kontaktům.'}</p>
    {loadError && <p className="status error" role="alert">{loadError}</p>}
    <div className="directorySelectionBar">
      <label className="resourceCheckbox"><input type="checkbox" checked={allVisibleSelected} disabled={!eligible.length || locked || loading} onChange={toggleVisible} />Vybrat tuto stránku</label>
      <span>Vybrané kontakty: {recipients.length} · E-mailové adresy: {emails.length}</span>
      <div className="actionsRight"><button className="ghostBtn" type="button" disabled={!selected.length || locked} onClick={() => { setSelected([]); setReview(false); }}>Zrušit výběr</button>
        <button className="primaryBtn" type="button" disabled={!emails.length || tooMany || locked || loading} onClick={() => { if (result) newMessage(); else setComposer(true); }}>Napsat e-mail vybraným</button></div>
    </div>
    {tooMany && <p className="status error" role="alert">Vyberte nejvýše 100 e-mailových adres a 300 kontaktů pro jednu zprávu.</p>}
    {result && <div className={`status ${result.failed ? 'error' : 'ok'}`} role="status">
      <p>Předáno k odeslání: {result.sent} z {result.total}.{result.failed > 0 && ` Nepodařilo se odeslat: ${result.failed}.`}</p>
      {result.failures?.length > 0 && <p>Neodeslané adresy: {result.failures.join(', ')}</p>}
      <p>Předání poštovnímu serveru není potvrzením doručení do schránky.</p>
      <button className="ghostBtn" type="button" onClick={onOpenLogs}>Zobrazit e-mailové logy</button>
    </div>}
    {composer && <div className="directoryComposer">
      <h3>Zpráva vybraným kontaktům</h3>
      <p className="muted">Každá adresa dostane samostatný e-mail. Opakované adresy odešleme jen jednou; odpovědi půjdou na e-mail přihlášeného administrátora. Adresář není seznam marketingových souhlasů.</p>
      <details className="directoryRecipients"><summary>Příjemci: {emails.length} (výběr může zahrnovat obě skupiny)</summary><ul>{emails.map((email) => <li key={email}>{email}</li>)}</ul></details>
      {!review ? <form className="directoryMailForm" onSubmit={preview}>
        <label>Předmět<input className="field" value={subject} maxLength={200} disabled={locked} onChange={(event) => setSubject(event.target.value)} required /></label>
        <label>Text zprávy<textarea className="field" value={message} maxLength={10000} rows={8} disabled={locked} onChange={(event) => setMessage(event.target.value)} required /></label>
        <div className="actionsRight"><button className="primaryBtn" type="submit" disabled={!emails.length || tooMany || locked}>Zkontrolovat před odesláním</button><button className="ghostBtn" type="button" onClick={() => setComposer(false)}>Zavřít</button></div>
      </form> : <div className="directoryMailPreview"><h4>{subject.trim()}</h4><p className="directoryMessageText">{message.trim()}</p>
        <p>Po potvrzení se zpráva odešle jednotlivě. Počet e-mailových adres: {emails.length}.</p>
        {sendError && <p className="status error" role="alert">{sendError}</p>}
        {attempt && !sending && <p className="muted">Opakovaný pokus ověří stejnou zprávu, aby se nerozeslala dvakrát. Při přerušeném odesílání zkontrolujte logy.</p>}
        <div className="actionsRight"><button className="primaryBtn" type="button" disabled={sending || !emails.length || tooMany} onClick={send}>{sending ? 'Odesílám…' : attempt ? 'Zkusit ověřit odeslání' : `Potvrdit odeslání (${emails.length})`}</button><button className="ghostBtn" type="button" disabled={locked} onClick={() => setReview(false)}>Upravit zprávu</button>{attempt && !sending && <button className="ghostBtn" type="button" onClick={onOpenLogs}>Zkontrolovat logy</button>}</div>
      </div>}
      {!review && sendError && <p className="status error" role="alert">{sendError}</p>}
    </div>}
    {result && <button className="ghostBtn" type="button" onClick={newMessage}>Připravit další zprávu</button>}
    <div className="directoryList" aria-label="Kontakty">
      {!loading && !visible.length && <p className="muted">{search ? 'Hledání neodpovídá žádný kontakt.' : group === 'registered' ? 'Zatím nemáte žádné registrované hráče.' : 'Zatím nemáte žádné hosty.'}</p>}
      {visible.map((contact) => <article key={contact.id} className={`directoryContact ${selectedSet.has(contact.id) ? 'directoryContact--selected' : ''}`}>
        <label className="directoryContactName"><input type="checkbox" aria-label={`Vybrat kontakt ${nameOf(contact)} (${contact.email})`} checked={selectedSet.has(contact.id)} disabled={!contact.canEmail || locked || loading} onChange={() => toggle(contact.id)} /><strong>{nameOf(contact)}</strong></label>
        <div className="directoryContactDetails"><span>{contact.email || 'Bez e-mailu'}</span><span>{contact.phone || 'Telefon neuveden'}</span></div>
        <div className="directoryContactMeta"><span>Rezervace: {contact.bookingCount}</span><span>Poslední objednávka: {dateOf(contact.lastBookingAt)}</span><span>{contact.registered ? 'Účet od' : 'Kontakt od'}: {dateOf(contact.createdAt)}</span>{!contact.canEmail && <span className="errorText">Nelze poslat e-mail</span>}</div>
      </article>)}
    </div>
    <div className="directoryPagination"><span>Kontakty: {filtered.length} · stránka {currentPage} z {pages}</span><div className="actionsRight"><button className="ghostBtn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Předchozí</button><button className="ghostBtn" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Další</button></div></div>
  </section>;
}
