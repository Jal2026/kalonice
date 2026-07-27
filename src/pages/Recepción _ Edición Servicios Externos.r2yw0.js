// =====================================================
// KAMISUITE - Page Code: Gestión Servicios Externos (Admin)
// =====================================================
// VERSION: 1.0.0
// FECHA: 13 de marzo de 2026
//
// ARCHIVO: Page Code de la página "Gestión Servicios Externos"
// WIDGET: htmlAdminExternos (HtmlComponent)
//
// FLUJO:
//   1. Widget envía 'ready'
//   2. Page code carga catálogo CMS via getExternosCatalogo()
//   3. Envía 'initData' con catálogo completo
//   4. Widget envía 'save' → page code llama saveExternoItem()
//   5. Widget envía 'delete' → page code llama deleteExternoItem()
//   6. Widget envía 'reload' → page code recarga catálogo
//   7. Widget envía 'resize' → page code ajusta altura
//
// DEPENDENCIAS:
//   - backend/externosLogic.web.js v1.1.5+
// =====================================================

import {
  getExternosCatalogo,
  saveExternoItem,
  deleteExternoItem
} from 'backend/externosLogic.web';

const TAG = '[Externos][Admin][PC][1.0.0]';

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  const widget = $w('#htmlAdminExternos');

  function sendToWidget(type, payload = {}) {
    widget.postMessage({ type, payload });
  }

  widget.onMessage((event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    console.log(`${TAG} 📩 Widget → ${msg.type}`);

    switch (msg.type) {
      case 'ready':
        handleReady();
        break;
      case 'save':
        handleSave(msg);
        break;
      case 'delete':
        handleDelete(msg);
        break;
      case 'reload':
        handleReady();
        break;
      case 'resize':
        handleResize(msg);
        break;
      default:
        console.log(`${TAG} ⚠️ Mensaje no reconocido: ${msg.type}`);
    }
  });

  // ─── READY: cargar catálogo ───
  async function handleReady() {
    try {
      console.log(`${TAG} 🔄 Cargando catálogo...`);

      const result = await getExternosCatalogo();

      if (!result.ok) {
        console.error(`${TAG} ❌ Error catálogo:`, result.error);
        sendToWidget('error', { message: result.error?.message || 'Error cargando catálogo' });
        return;
      }

      console.log(`${TAG} ✅ Catálogo: ${result.catalogo.length} items`);
      sendToWidget('initData', { catalogo: result.catalogo });

    } catch (e) {
      console.error(`${TAG} ❌ handleReady:`, e.message);
      sendToWidget('error', { message: e.message });
    }
  }

  // ─── SAVE (insert o update) ───
  async function handleSave(msg) {
    try {
      const item = msg.item || {};
      console.log(`${TAG} 💾 Guardar: ${item._id ? 'UPDATE' : 'INSERT'} | ${item.title}`);

      const result = await saveExternoItem({ item });
      sendToWidget('saveResult', result);

    } catch (e) {
      console.error(`${TAG} ❌ save:`, e.message);
      sendToWidget('saveResult', { ok: false, error: { message: e.message } });
    }
  }

  // ─── DELETE ───
  async function handleDelete(msg) {
    try {
      const itemId = msg.itemId || '';
      console.log(`${TAG} 🗑️ Eliminar: ${itemId}`);

      const result = await deleteExternoItem({ itemId });
      sendToWidget('deleteResult', result);

    } catch (e) {
      console.error(`${TAG} ❌ delete:`, e.message);
      sendToWidget('deleteResult', { ok: false, error: { message: e.message } });
    }
  }

  // ─── RESIZE ───
  function handleResize(msg) {
    if (msg.height && msg.height > 100) {
      widget.style.height = `${msg.height}px`;
    }
  }
});