import 'cypress-real-events';
import FakeTimers from '@sinonjs/fake-timers';
import type { IN8nUISettings } from 'n8n-workflow';
import { WorkflowPage } from '../pages';
import {
	BACKEND_BASE_URL,
	INSTANCE_ADMIN,
	INSTANCE_MEMBERS,
	INSTANCE_OWNER,
	N8N_AUTH_COOKIE,
} from '../constants';
import { getUniqueWorkflowName } from '../utils/workflowUtils';

Cypress.Commands.add('setAppDate', (targetDate: number | Date) => {
	cy.window().then((win) => {
		FakeTimers.withGlobal(win).install({
			now: targetDate,
			toFake: ['Date'],
			shouldAdvanceTime: true,
		});
	});
});

Cypress.Commands.add('getByTestId', (selector, ...args) => {
	return cy.get(`[data-test-id="${selector}"]`, ...args);
});

Cypress.Commands.add(
	'createFixtureWorkflow',
	(fixtureKey: string, workflowName = getUniqueWorkflowName()) => {
		const workflowPage = new WorkflowPage();

		// We need to force the click because the input is hidden
		workflowPage.getters
			.workflowImportInput()
			.selectFile(`fixtures/${fixtureKey}`, { force: true });

		cy.waitForLoad(false);
		workflowPage.actions.setWorkflowName(workflowName);
		workflowPage.getters.saveButton().should('contain', 'Saved');
		workflowPage.actions.zoomToFit();
	},
);

Cypress.Commands.addQuery('findChildByTestId', function (testId: string) {
	return (subject: Cypress.Chainable) => subject.find(`[data-test-id="${testId}"]`);
});

Cypress.Commands.add('waitForLoad', (waitForIntercepts = true) => {
	// These aliases are set-up before each test in cypress/support/e2e.ts
	// we can't set them up here because at this point it would be too late
	// and the requests would already have been made
	if (waitForIntercepts) {
		cy.wait(['@loadSettings', '@loadNodeTypes']);
	}
	cy.getByTestId('node-view-loader', { timeout: 20000 }).should('not.exist');
	cy.get('.el-loading-mask', { timeout: 20000 }).should('not.exist');
});

Cypress.Commands.add('signin', ({ email, password }) => {
	void Cypress.session.clearAllSavedSessions();
	cy.session([email, password], () => {
		return cy
			.request({
				method: 'POST',
				url: `${BACKEND_BASE_URL}/rest/login`,
				body: { email, password },
				failOnStatusCode: false,
			})
			.then((response) => {
				Cypress.env('currentUserId', response.body.data.id);
			});
	});
});

Cypress.Commands.add('signinAsOwner', () => cy.signin(INSTANCE_OWNER));
Cypress.Commands.add('signinAsAdmin', () => cy.signin(INSTANCE_ADMIN));
Cypress.Commands.add('signinAsMember', (index = 0) => cy.signin(INSTANCE_MEMBERS[index]));

Cypress.Commands.add('signout', () => {
	cy.request({
		method: 'POST',
		url: `${BACKEND_BASE_URL}/rest/logout`,
		headers: { 'browser-id': localStorage.getItem('n8n-browserId') },
	});
	cy.getCookie(N8N_AUTH_COOKIE).should('not.exist');
});

export let settings: Partial<IN8nUISettings>;
Cypress.Commands.add('overrideSettings', (value: Partial<IN8nUISettings>) => {
	settings = value;
});

const setFeature = (feature: string, enabled: boolean) =>
	cy.request('PATCH', `${BACKEND_BASE_URL}/rest/e2e/feature`, {
		feature: `feat:${feature}`,
		enabled,
	});

const setQuota = (feature: string, value: number) =>
	cy.request('PATCH', `${BACKEND_BASE_URL}/rest/e2e/quota`, {
		feature: `quota:${feature}`,
		value,
	});

const setQueueMode = (enabled: boolean) =>
	cy.request('PATCH', `${BACKEND_BASE_URL}/rest/e2e/queue-mode`, {
		enabled,
	});

Cypress.Commands.add('enableFeature', (feature: string) => setFeature(feature, true));
Cypress.Commands.add('changeQuota', (feature: string, value: number) => setQuota(feature, value));
Cypress.Commands.add('disableFeature', (feature: string) => setFeature(feature, false));
Cypress.Commands.add('enableQueueMode', () => setQueueMode(true));
Cypress.Commands.add('disableQueueMode', () => setQueueMode(false));

Cypress.Commands.add('grantBrowserPermissions', (...permissions: string[]) => {
	if (Cypress.isBrowser('chrome')) {
		cy.wrap(
			Cypress.automation('remote:debugger:protocol', {
				command: 'Browser.grantPermissions',
				params: {
					permissions,
					origin: window.location.origin,
				},
			}),
		);
	}
});

Cypress.Commands.add('readClipboard', () =>
	cy.window().then((win) => win.navigator.clipboard.readText()),
);

Cypress.Commands.add('paste', { prevSubject: true }, (selector, pastePayload) => {
	// https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event
	cy.wrap(selector).then(($destination) => {
		const pasteEvent = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
			clipboardData: {
				getData: () => pastePayload,
			},
		});
		$destination[0].dispatchEvent(pasteEvent);
	});
});

Cypress.Commands.add('drag', (selector, pos, options) => {
	const index = options?.index ?? 0;
	const [xDiff, yDiff] = pos;
	const element = typeof selector === 'string' ? cy.get(selector).eq(index) : selector;
	element.should('exist');

	element.then(([$el]) => {
		const originalLocation = $el.getBoundingClientRect();
		const newPosition = {
			x: options?.abs ? xDiff : originalLocation.right + xDiff,
			y: options?.abs ? yDiff : originalLocation.top + yDiff,
		};
		if (options?.realMouse) {
			element.realMouseDown();
			element.realMouseMove(newPosition.x, newPosition.y);
			element.realMouseUp();
		} else {
			element.trigger('mousedown', { force: true });
			element.trigger('mousemove', {
				which: 1,
				pageX: newPosition.x,
				pageY: newPosition.y,
				force: true,
			});
			if (options?.clickToFinish) {
				// Click to finish the drag
				// For some reason, mouseup isn't working when moving nodes
				cy.get('body').click(newPosition.x, newPosition.y);
			} else {
				element.trigger('mouseup', { force: true });
			}
		}
	});
});

Cypress.Commands.add('draganddrop', (draggableSelector, droppableSelector, options) => {
	if (draggableSelector) {
		cy.get(draggableSelector).should('exist');
	}
	cy.get(droppableSelector).should('exist');

	cy.get(droppableSelector)
		.first()
		.then(([$el]) => {
			const coords = $el.getBoundingClientRect();

			const pageX = coords.left + coords.width / 2;
			const pageY = coords.top + coords.height / 2;

			if (draggableSelector) {
				// We can't use realMouseDown here because it hangs headless run
				cy.get(draggableSelector).trigger('mousedown');
			}
			// We don't chain these commands to make sure cy.get is re-trying correctly
			cy.get(droppableSelector).realMouseMove(0, 0);
			cy.get(droppableSelector).realMouseMove(pageX, pageY);
			cy.get(droppableSelector).realHover();
			cy.get(droppableSelector).realMouseUp({ position: options?.position ?? 'top' });
			if (draggableSelector) {
				cy.get(draggableSelector).realMouseUp();
			}
		});
});

Cypress.Commands.add('push', (type, data) => {
	cy.request('POST', `${BACKEND_BASE_URL}/rest/e2e/push`, {
		type,
		data,
	});
});

Cypress.Commands.add('shouldNotHaveConsoleErrors', () => {
	cy.window().then((win) => {
		const spy = cy.spy(win.console, 'error');
		cy.wrap(spy).should('not.have.been.called');
	});
});

Cypress.Commands.add('resetDatabase', () => {
	cy.request('POST', `${BACKEND_BASE_URL}/rest/e2e/reset`, {
		owner: INSTANCE_OWNER,
		members: INSTANCE_MEMBERS,
		admin: INSTANCE_ADMIN,
	});
});
