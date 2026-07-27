import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

export const getMyContactExtendedFields = webMethod(
  Permissions.SiteMember,
  async (contactId) => {
    try {
      if (!contactId) {
        return { ok: false, error: 'No contactId recibido' };
      }

      const elevatedGetContact = elevate(contacts.getContact);
      const contact = await elevatedGetContact(contactId);

      const extendedFields =
        contact?.info?.extendedFields ||
        contact?.extendedFields ||
        {};

      return {
        ok: true,
        contactId,
        extendedFields
      };
    } catch (e) {
      return {
        ok: false,
        error: e?.message || String(e),
        stack: e?.stack
      };
    }
  }
);
