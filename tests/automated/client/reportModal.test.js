/**
 * Tests for client/src/components/ReportModal.js — REPORT_TYPES constant
 * and ReportModal component rendering/interactions.
 *
 * Sets up a manual jsdom environment since jest-environment-jsdom has a version
 * mismatch, then uses real React for component rendering.
 */

const { JSDOM } = require('jsdom');

// Set up jsdom globals before requiring React
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.MouseEvent = dom.window.MouseEvent;
global.Event = dom.window.Event;

const React = require('react');
const ReactDOM = require('react-dom');

// Mock createPortal to render children directly instead of into a portal
const originalCreatePortal = ReactDOM.createPortal;
ReactDOM.createPortal = (node) => node;

const ReportModalModule = require('../../../client/src/components/ReportModal');
const ReportModal = ReportModalModule.default;
const { REPORT_TYPES } = ReportModalModule;

afterAll(() => {
  ReactDOM.createPortal = originalCreatePortal;
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.HTMLElement;
  delete global.HTMLInputElement;
  delete global.MouseEvent;
  delete global.Event;
});

// ─── REPORT_TYPES constant ───────────────────────────────────────────────────
describe('REPORT_TYPES constant', () => {
  test('has exactly 4 report types', () => {
    expect(REPORT_TYPES).toHaveLength(4);
  });

  test('each has value, label, description', () => {
    REPORT_TYPES.forEach(rt => {
      expect(rt).toHaveProperty('value');
      expect(rt).toHaveProperty('label');
      expect(rt).toHaveProperty('description');
    });
  });

  test('all values are unique', () => {
    const values = REPORT_TYPES.map(rt => rt.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test('contains expected types: spam, harassment, inappropriate, other', () => {
    const values = REPORT_TYPES.map(rt => rt.value);
    expect(values).toContain('spam');
    expect(values).toContain('harassment');
    expect(values).toContain('inappropriate');
    expect(values).toContain('other');
  });

  test('all labels/descriptions are non-empty strings', () => {
    REPORT_TYPES.forEach(rt => {
      expect(typeof rt.label).toBe('string');
      expect(rt.label.length).toBeGreaterThan(0);
      expect(typeof rt.description).toBe('string');
      expect(rt.description.length).toBeGreaterThan(0);
    });
  });
});

// ─── ReportModal rendering ───────────────────────────────────────────────────
describe('ReportModal rendering', () => {
  let container;
  let actFn;

  beforeAll(() => {
    // React 18 exposes act on the react package; fall back to react-dom/test-utils
    actFn = React.act || require('react-dom/test-utils').act;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  function renderModal(propOverrides = {}) {
    const props = {
      target: { username: 'TestUser' },
      onSubmit: jest.fn(),
      onClose: jest.fn(),
      ...propOverrides,
    };
    actFn(() => {
      ReactDOM.render(React.createElement(ReportModal, props), container);
    });
    return props;
  }

  test('renders title "Report {username}" for user target', () => {
    renderModal({ target: { username: 'Alice' } });
    const h2 = container.querySelector('h2');
    expect(h2.textContent).toBe('Report Alice');
  });

  test('renders title "Report Message" for message target', () => {
    renderModal({ target: { username: 'Bob', messagePreview: 'Some bad message' } });
    const h2 = container.querySelector('h2');
    expect(h2.textContent).toBe('Report Message');
  });

  test('renders message preview when provided', () => {
    renderModal({ target: { username: 'Bob', messagePreview: 'Bad content here' } });
    expect(container.textContent).toContain('Bad content here');
  });

  test('submit button disabled when no type selected', () => {
    renderModal();
    const buttons = container.querySelectorAll('button');
    const submitBtn = buttons[buttons.length - 1];
    expect(submitBtn.disabled).toBe(true);
  });

  test('calls onSubmit with { reportType, description } on submit', () => {
    const onSubmit = jest.fn();
    renderModal({ onSubmit });

    // Select the first report type
    const radios = container.querySelectorAll('input[type="radio"]');
    actFn(() => { radios[0].click(); });

    // Click submit
    const buttons = container.querySelectorAll('button');
    const submitBtn = buttons[buttons.length - 1];
    actFn(() => { submitBtn.click(); });

    expect(onSubmit).toHaveBeenCalledWith({ reportType: 'spam', description: '' });
  });

  test('calls onClose when Cancel clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    const buttons = container.querySelectorAll('button');
    const cancelBtn = buttons[0];
    actFn(() => { cancelBtn.click(); });

    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when overlay clicked (e.target === e.currentTarget)', () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // The overlay is the outermost div rendered by the component
    const overlay = container.firstChild;
    actFn(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });

  test('does not submit when no type selected', () => {
    const onSubmit = jest.fn();
    renderModal({ onSubmit });

    // Click submit without selecting a type
    const buttons = container.querySelectorAll('button');
    const submitBtn = buttons[buttons.length - 1];
    actFn(() => { submitBtn.click(); });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
