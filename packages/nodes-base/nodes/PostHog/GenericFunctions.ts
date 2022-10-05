import { OptionsWithUrl } from 'request';

import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-core';

import { IDataObject, JsonObject, NodeApiError } from 'n8n-workflow';

export async function posthogApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	path: string,
	// tslint:disable-next-line:no-any
	body: any = {},
	qs: IDataObject = {},
	option = {},
	// tslint:disable-next-line:no-any
): Promise<any> {
	const credentials = await this.getCredentials('postHogApi');

	const base = credentials.url as string;

	body.api_key = credentials.apiKey as string;

	const options: OptionsWithUrl = {
		headers: {
			'Content-Type': 'application/json',
		},
		method,
		body,
		qs,
		url: `${base}${path}`,
		json: true,
	};

	try {
		if (Object.keys(body).length === 0) {
			delete options.body;
		}
		return await this.helpers.request!(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export interface IEvent {
	event: string;
	properties: { [key: string]: any }; // tslint:disable-line:no-any
}

export interface IAlias {
	type: string;
	event: string;
	properties: { [key: string]: any }; // tslint:disable-line:no-any
	context: { [key: string]: any }; // tslint:disable-line:no-any
}

export interface ITrack {
	type: string;
	event: string;
	name: string;
	messageId?: string;
	distinct_id: string;
	category?: string;
	properties: { [key: string]: any }; // tslint:disable-line:no-any
	context: { [key: string]: any }; // tslint:disable-line:no-any
}

export interface IIdentity {
	event: string;
	messageId?: string;
	distinct_id: string;
	properties: { [key: string]: any }; // tslint:disable-line:no-any
}
