'use client'
export default function ReceptionistPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>AI Receptionist</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>Your 24/7 AI that answers calls and captures leads automatically.</p>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 24, marginBottom: 32 }}>
        <p style={{ fontWeight: 600, marginBottom: 8, color: '#1e40af' }}>Setup required</p>
        <p style={{ fontSize: 14, color: '#1e3a8a', marginBottom: 16, lineHeight: 1.6 }}>
          To activate your AI receptionist, you need a Twilio phone number. Once set up, any call to that number will be answered automatically by your AI.
        </p>
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 13, color: '#1e40af' }}>
          Webhook URL: your-domain.com/api/twilio/voice
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total calls handled', value: '0' },
          { label: 'Leads captured', value: '0' },
          { label: 'Jobs booked', value: '0' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>{s.label}</p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <p style={{ fontWeight: 600, margin: 0 }}>Recent calls</p>
        </div>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ margin: '0 0 8px', fontSize: 16 }}>No calls yet</p>
          <p style={{ margin: 0, fontSize: 14 }}>Once your Twilio number is set up, calls will appear here</p>
        </div>
      </div>
    </div>
  )
}