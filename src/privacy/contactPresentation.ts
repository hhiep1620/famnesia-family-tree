import type { Person } from '../types/family'

export interface AuthorizedContactFields {
  phone?: string[]
  email?: string
  address?: string
  privateNote?: string
}

export function redactPersonContact(person: Person): Person {
  const redacted = { ...person, phone1: '', phone2: '', address: '', note: '' } as Person & { email?: unknown }
  delete redacted.email
  return redacted
}

export function mergeAuthorizedContactFields(
  persons: Person[],
  authorizedByPersonId: ReadonlyMap<string, AuthorizedContactFields>,
): Person[] {
  return persons.map((person) => {
    const redacted = redactPersonContact(person)
    const fields = authorizedByPersonId.get(person.id)
    if (!fields) return redacted
    return {
      ...redacted,
      phone1: fields.phone?.[0] ?? '',
      phone2: fields.phone?.[1] ?? '',
      address: fields.address ?? '',
      note: fields.privateNote ?? '',
    }
  })
}
