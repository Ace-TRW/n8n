import { OptionsWithUri } from 'request';

import {
	IExecuteFunctions,
	IExecuteSingleFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
} from 'n8n-core';

import { IDataObject, JsonObject, NodeApiError } from 'n8n-workflow';

export async function tapfiliateApiRequest(
	this: IHookFunctions | IExecuteFunctions | IExecuteSingleFunctions | ILoadOptionsFunctions,
	method: string,
	endpoint: string,
	// tslint:disable-next-line:no-any
	body: any = {},
	qs: IDataObject = {},
	uri?: string | undefined,
	option: IDataObject = {},
	// tslint:disable-next-line:no-any
): Promise<any> {
	const credentials = await this.getCredentials('tapfiliateApi');

	const options: OptionsWithUri = {
		headers: {
			'Api-Key': credentials.apiKey,
		},
		method,
		qs,
		body,
		uri: uri || `https://api.tapfiliate.com/1.6${endpoint}`,
		json: true,
	};

	if (Object.keys(body).length === 0) {
		delete options.body;
	}

	if (Object.keys(option).length !== 0) {
		Object.assign(options, option);
	}
	try {
		return await this.helpers.request!(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export async function tapfiliateApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	endpoint: string,
	// tslint:disable-next-line:no-any
	body: any = {},
	query: IDataObject = {},
	// tslint:disable-next-line:no-any
): Promise<any> {
	const returnData: IDataObject[] = [];

	let responseData;

	query.page = 1;

	do {
		responseData = await tapfiliateApiRequest.call(this, method, endpoint, body, query, '', {
			resolveWithFullResponse: true,
		});
		returnData.push.apply(returnData, responseData.body);
		query.page++;
	} while (responseData.headers.link.includes('next'));

	return returnData;
}
