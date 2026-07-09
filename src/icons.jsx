// Hidden SVG symbol library — copied verbatim from the design so `<use>`
// references stay identical. Rendered once at the top of the app.
const ICON_DEFS = `
<symbol id="ic-clock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></g></symbol>
<symbol id="ic-calendar" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"></rect><path d="M3.5 9.5h17M8 3v4M16 3v4"></path></g></symbol>
<symbol id="ic-user" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c0-3.5 2.9-5.8 6.5-5.8s6.5 2.3 6.5 5.8"></path></g></symbol>
<symbol id="ic-phone" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4h3l1.5 4-2 1.3a11 11 0 0 0 4.7 4.7l1.3-2 4 1.5v3a2 2 0 0 1-2.1 2A14.5 14.5 0 0 1 4.5 6.1 2 2 0 0 1 6.5 4z"></path></g></symbol>
<symbol id="ic-flame" viewBox="0 0 24 24"><g fill="currentColor"><path d="M12 2.5c1.7 3 4.6 4.6 4.6 8.5A4.6 4.6 0 0 1 12 15.8a4.6 4.6 0 0 1-4.6-4.6c0-1.5.7-2.5 1.5-3.5C9.9 9.6 10.3 7.4 12 2.5z"></path></g></symbol>
<symbol id="ic-check" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"></path></g></symbol>
<symbol id="ic-sync" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 0 1-11.9 4.9M5 12A7 7 0 0 1 16.9 7.1"></path><path d="M16.7 3.6v3.5h-3.5M7.3 20.4v-3.5h3.5"></path></g></symbol>
<symbol id="ic-alert" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21 19H3z"></path><path d="M12 10v4.2M12 16.6v.4"></path></g></symbol>
<symbol id="ic-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M21 21l-4.3-4.3"></path></g></symbol>
<symbol id="ic-bell" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 4.5 1.5 5.8 1.5 5.8H5S6.5 13.5 6.5 9z"></path><path d="M10 18a2 2 0 0 0 4 0"></path></g></symbol>
<symbol id="ic-plus" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.5v13M5.5 12h13"></path></g></symbol>
<symbol id="ic-trend" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-5 3.5 3.5L20 7"></path><path d="M15 7h5v5"></path></g></symbol>
<symbol id="ic-users" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"></path><path d="M16 6.6a3 3 0 0 1 0 5.7M21 19c0-2.3-1.5-4.1-3.7-4.7"></path></g></symbol>
<symbol id="ic-x" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></g></symbol>
<symbol id="ic-ext" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"></path><path d="M11 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4"></path></g></symbol>
<symbol id="ic-arrowr" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h14M13 6l6 6-6 6"></path></g></symbol>
<symbol id="ic-chevl" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></g></symbol>
<symbol id="ic-chevr" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></g></symbol>
<symbol id="ic-comment" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5a2 2 0 0 1-2 2H9l-4.5 3.5v-13a2 2 0 0 1 2-2h11.5a2 2 0 0 1 2 2z"></path><path d="M8.5 9.5h7M8.5 12.5h4"></path></g></symbol>
`

export function IconDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<defs>${ICON_DEFS}</defs>` }}
    />
  )
}

// Convenience wrapper around <use href="#...">.
export function Icon({ id, size = 15, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
      <use href={`#${id}`} />
    </svg>
  )
}
