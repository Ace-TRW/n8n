import { OptionsWithUri } from 'request';

import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-core';

import {
	IDataObject,
	IHookFunctions,
	IWebhookFunctions,
	JsonObject,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import { get } from 'lodash';

export async function mondayComApiRequest(
	this: IExecuteFunctions | IWebhookFunctions | IHookFunctions | ILoadOptionsFunctions,
	// tslint:disable-next-line:no-any
	body: any = {},
	option: IDataObject = {},
	// tslint:disable-next-line:no-any
): Promise<any> {
	const authenticationMethod = this.getNodeParameter('authentication', 0) as string;

	const endpoint = 'https://api.monday.com/v2/';

	let options: OptionsWithUri = {
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
		body,
		uri: endpoint,
		json: true,
	};
	options = Object.assign({}, options, option);
	try {
		if (authenticationMethod === 'accessToken') {
			const credentials = await this.getCredentials('mondayComApi');

			options.headers = { Authorization: `Bearer ${credentials.apiToken}` };

			return await this.helpers.request!(options);
		} else {
			return await this.helpers.requestOAuth2!.call(this, 'mondayComOAuth2Api', options);
		}
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export async function mondayComApiRequestAllItems(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	propertyName: string,
	// tslint:disable-next-line:no-any
	body: any = {},
	// tslint:disable-next-line:no-any
): Promise<any> {
	const returnData: IDataObject[] = [];

	let responseData;
	body.variables.limit = 50;
	body.variables.page = 1;

	do {
		responseData = await mondayComApiRequest.call(this, body);
		returnData.push.apply(returnData, get(responseData, propertyName));
		body.variables.page++;
	} while (get(responseData, propertyName).length > 0);
	return returnData;
}
