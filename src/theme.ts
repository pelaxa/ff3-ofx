import { createTheme } from '@mui/material/styles';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Change values here to retheme the whole app.
const tokens = {
  bgBody:        '#1a1d23',   // page / outermost background
  bgSurface:     '#282c34',   // card / paper background
  bgSunken:      '#1e2129',   // table headers, inset panels, stepper bg
  border:        '#3a3f4b',   // all borders and dividers
  textPrimary:   '#e0e0e0',
  textSecondary: '#9e9e9e',
  textMuted:     '#546e8a',
  accent:        '#90caf9',   // version badge, links
  blue:          '#1565c0',   // AppBar, primary buttons, progress
  success:       '#66bb6a',
  error:         '#ef5350',
  warning:       '#ffa726',
};

export { tokens };

// ─── Theme ────────────────────────────────────────────────────────────────────
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:         tokens.blue,
      light:        tokens.accent,
      contrastText: '#ffffff',
    },
    secondary: {
      main: tokens.textMuted,
    },
    background: {
      default: tokens.bgBody,
      paper:   tokens.bgSurface,
    },
    success: { main: tokens.success },
    error:   { main: tokens.error },
    warning: { main: tokens.warning },
    divider: tokens.border,
    text: {
      primary:   tokens.textPrimary,
      secondary: tokens.textSecondary,
    },
  },

  shape: { borderRadius: 8 },

  // ─── Typography scale ──────────────────────────────────────────────────────
  typography: {
    fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    h3: { fontSize: '23px',  fontWeight: 400 },   // account name in Summary
    h4: { fontSize: '28px',  fontWeight: 300 },   // diff amount
    h5: { fontSize: '26px',  fontWeight: 300 },   // balance amounts
    h6: { fontSize: '22px',  fontWeight: 700, textTransform: 'none' as const },  // AppBar
    subtitle1: { fontSize: '20px', fontWeight: 400 },  // page section titles
    subtitle2: { fontSize: '15px', fontWeight: 500 },  // card section titles
    body1:   { fontSize: '14px' },
    body2:   { fontSize: '13px' },
    caption: { fontSize: '11px' },
    overline:{ fontSize: '11px', letterSpacing: '0.6px' },
  },

  components: {
    // ── AppBar ────────────────────────────────────────────────────────────────
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: tokens.blue,
          boxShadow: '0 2px 8px rgba(0,0,0,.5)',
        },
      },
    },

    // ── Cards ─────────────────────────────────────────────────────────────────
    MuiCard: {
      styleOverrides: {
        root: { borderColor: tokens.border },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },

    // ── Tables ────────────────────────────────────────────────────────────────
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: tokens.border,
          fontSize: '13px',
        },
        head: {
          backgroundColor: tokens.bgSunken,
          color:           tokens.textSecondary,
          fontSize:        '11px',
          textTransform:   'uppercase' as const,
          letterSpacing:   '0.6px',
          fontWeight:      600,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover td': { backgroundColor: tokens.bgSunken },
        },
      },
    },

    // ── Chips ─────────────────────────────────────────────────────────────────
    // Give outlined chips a subtle tinted background so they match the mockup.
    MuiChip: {
      styleOverrides: {
        root: {
          fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px',
          '&.MuiChip-outlinedSuccess':   { backgroundColor: 'rgba(102,187,106,.12)' },
          '&.MuiChip-outlinedError':     { backgroundColor: 'rgba(239, 83, 80,.12)' },
          '&.MuiChip-outlinedPrimary':   { backgroundColor: 'rgba( 66,165,245,.12)' },
          '&.MuiChip-outlinedSecondary': { backgroundColor: 'rgba(171, 71,188,.12)' },
        },
      },
    },

    // ── Progress bar ──────────────────────────────────────────────────────────
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: tokens.border,
        },
      },
    },

    // ── Alerts ────────────────────────────────────────────────────────────────
    MuiAlert: {
      styleOverrides: {
        outlined: {
          borderLeft:      `4px solid ${tokens.blue}`,
          borderRight:     'none',
          borderTop:       'none',
          borderRadius:    0,
          backgroundColor: 'rgba(21,101,192,.1)',
        },
      },
    },

    // ── Text fields ───────────────────────────────────────────────────────────
    MuiFilledInput: {
      styleOverrides: {
        root: { backgroundColor: tokens.bgSunken },
      },
    },

  },
});
