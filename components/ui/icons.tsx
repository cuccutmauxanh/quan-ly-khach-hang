import React from 'react'

interface IcProps {
  size?: number
  stroke?: string
  sw?: number
}

function Ic({ d, d2, size = 16, stroke = 'currentColor', sw = 1.75 }: {
  d: string; d2?: string; size?: number; stroke?: string; sw?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  )
}

export const IPhone     = (p: IcProps) => <Ic {...p} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2.77h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l.61-.61a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
export const IUsers     = (p: IcProps) => <Ic {...p} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" d2="M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
export const ICalendar  = (p: IcProps) => <Ic {...p} d="M8 2v4M16 2v4M3 10h18M21 8H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1z" />
export const IBarChart  = (p: IcProps) => <Ic {...p} d="M12 20V10M18 20V4M6 20v-4" />
export const ISettings  = (p: IcProps) => <Ic {...p} d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" d2="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
export const ILogOut    = (p: IcProps) => <Ic {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
export const IPhoneIn   = (p: IcProps) => <Ic {...p} d="M16 2v4h4M21 2l-5 5M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2.77h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l.61-.61a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
export const IPhoneOut  = (p: IcProps) => <Ic {...p} d="M22 2l-5 5M17 2h4v4M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2.77h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l.61-.61a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
export const ICalCheck  = (p: IcProps) => <Ic {...p} d="M8 2v4M16 2v4M3 10h18M21 8H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1zM9 16l2 2 4-4" />
export const ISearch    = (p: IcProps) => <Ic {...p} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
export const IPlus      = (p: IcProps) => <Ic {...p} d="M12 5v14M5 12h14" />
export const IUpload    = (p: IcProps) => <Ic {...p} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
export const IClose     = (p: IcProps) => <Ic {...p} d="M18 6 6 18M6 6l12 12" />
export const ISparkle   = (p: IcProps) => <Ic {...p} d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5z" />
export const ITrend     = (p: IcProps) => <Ic {...p} d="M3 17l4-8 4 4 4-6 4 4" />
export const IHeart     = (p: IcProps) => <Ic {...p} d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
export const IZap       = (p: IcProps) => <Ic {...p} d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
export const IRefresh   = (p: IcProps) => <Ic {...p} d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M3 3v5h5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M21 21v-5h-5" />
export const ICheck     = (p: IcProps) => <Ic {...p} d="M20 6 9 17l-5-5" />
export const IMoon      = (p: IcProps) => <Ic {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
export const ISun       = (p: IcProps) => <Ic {...p} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" d2="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
export const IMail      = (p: IcProps) => <Ic {...p} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" d2="M22 6l-10 7L2 6" />
export const IBell      = (p: IcProps) => <Ic {...p} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
export const IKanban    = (p: IcProps) => <Ic {...p} d="M4 3h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10.5 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM17 3h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
export const IBullhorn  = (p: IcProps) => <Ic {...p} d="M3 11l19-9-9 19-2-8-8-2z" />
export const ILightbulb = (p: IcProps) => <Ic {...p} d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2V17a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1.8A7 7 0 0 1 12 2z" />
export const ILayers    = (p: IcProps) => <Ic {...p} d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
export const IMic       = (p: IcProps) => <Ic {...p} d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" d2="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
export const IClock     = (p: IcProps) => <Ic {...p} d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2" />
export const ITarget    = (p: IcProps) => <Ic {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
export const IFilter    = (p: IcProps) => <Ic {...p} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
export const IDot       = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />
)
