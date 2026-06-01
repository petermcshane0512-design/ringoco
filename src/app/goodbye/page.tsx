/**
 * Post-deletion landing. Public — Clerk session is dead by the time the
 * user arrives. Re-signup is allowed with the same email; this page
 * tells them so explicitly + provides the path back.
 */
export default function GoodbyePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #ffffff 0%, #F2FDFB 22%, #E6FAF6 45%, #F0FCFA 68%, #E8F9F5 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid rgba(10,168,159,0.18)',
        borderRadius: 22,
        boxShadow: '0 24px 64px rgba(7,27,58,0.1)',
        maxWidth: 520,
        width: '100%',
        padding: '36px 32px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
          boxShadow: '0 8px 24px rgba(10,168,159,0.32)',
        }}>
          <span style={{ fontSize: 28 }}>👋</span>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', margin: '0 0 10px', letterSpacing: '-0.4px' }}>
          Your account is deleted.
        </h1>

        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.6, margin: '0 0 22px' }}>
          Your subscription is cancelled, your AI receptionist phone number is released, and your data has been erased. We won&apos;t charge you again.
        </p>

        <div style={{
          background: 'linear-gradient(135deg, #F5FDFB 0%, #ECF8F4 100%)',
          border: '1px solid rgba(10,168,159,0.18)',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 22,
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0AA89F', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Want to come back?
          </div>
          <p style={{ fontSize: 13, color: '#0B1F3A', lineHeight: 1.55, margin: 0 }}>
            You can sign up again with the same email anytime. You&apos;ll get a brand-new AI receptionist phone number — and we&apos;d love to have you back.
          </p>
        </div>

        <a
          href="/sign-up"
          style={{
            display: 'inline-block',
            padding: '14px 30px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(10,168,159,0.34)',
            marginRight: 10,
          }}
        >
          Sign up again →
        </a>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '14px 26px',
            borderRadius: 10,
            background: 'transparent',
            color: '#4A7A80',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            border: '1.5px solid rgba(10,168,159,0.25)',
          }}
        >
          Home
        </a>

        <div style={{
          marginTop: 24,
          fontSize: 11,
          color: '#7AAAB2',
          lineHeight: 1.55,
        }}>
          Questions? Text Peter at{' '}
          <a href="tel:7737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>(773) 710-9565</a>.
        </div>
      </div>
    </div>
  )
}
