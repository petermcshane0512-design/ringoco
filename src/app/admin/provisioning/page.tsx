// /admin/provisioning is an alias to /admin/queue#provisioning — keeps the
// SMS deep link short and readable, even though the queue page is the real UI.
import { redirect } from 'next/navigation'

export default function AdminProvisioningPage() {
  redirect('/admin/queue')
}
