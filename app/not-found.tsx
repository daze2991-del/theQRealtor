import BrandedNotice, { SIGN_INACTIVE_TITLE, SIGN_INACTIVE_BODY } from '../components/BrandedNotice'

// Any unknown URL gets the branded notice instead of Next's bare 404.
export default function NotFound() {
  return <BrandedNotice title={SIGN_INACTIVE_TITLE}>{SIGN_INACTIVE_BODY}</BrandedNotice>
}
