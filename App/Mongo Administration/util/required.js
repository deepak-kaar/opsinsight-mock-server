//TODO: 
// 1. need to store datatype of the fields
// 2. Default values for each collection
// 3. keep updating this file still finalizing the schema
// 4. always add createdOn when creating
// 5. always update modifiedOn/updatedOn when editing


// ✅ MongoDB Collection Definitions with Correct BSON Data Types

export const attr_collection = {
  requiredFields: [
    'attributeId', 'attributeName', 'entityOrInstanceId', 'value'
  ],
  media: false,
  defaultValues: {},
  validate: {
    attributeId: 'string',
    attributeName: 'string',
    entityOrInstanceId: 'string',
    value: 'double',
    createdOn: 'date'
  },
  isa: false,
  isApp: false
};

export const config_collection = {
  requiredFields: [
    '_id', 'configId', 'configName', 'configValue', 'appId', 'appName'
  ],
  media: false,
  defaultValues: {},
  validate: {
    _id: 'objectId',
    configId: 'string',
    configName: 'string',
    configValue: 'string',
    appId: 'string',
    appName: 'string'
  },
  isApp: true,
  isOrg: false
};

export const email_collection = {
  requiredFields: [
    '_id', 'emailId', 'from', 'to', 'emailSubject'
  ],
  media: true,
  defaultValues: {},
  validate: {
    _id: 'objectId',
    emailId: 'string',
    from: 'string',
    to: 'array',
    emailSubject: 'string',
    createdOn: 'date'
  },
  isOrg: false,
  isApp: false
};

export const report_collection = {
  requiredFields: [
    '_id', 'reportImageId', 'appId', 'appName', 'orgId', 'orgName', 'createdBy'
  ],
  media: true,
  defaultValues: {},
  validate: {
    _id: 'objectId',
    reportImageId: 'string',
    appId: 'string',
    appName: 'string',
    orgId: 'string',
    orgName: 'string',
    createdBy: 'string',
    createdOn: 'date'
  },
  isApp: true,
  isOrg: true
};

export const scheduler_collection = {
  requiredFields: [
    '_id', 'schedulerJobId', 'schedulerJobName', 'cronExpression'
  ],
  media: false,
  defaultValues: {
    inScheduled: true
  },
  validate: {
    _id: 'objectId',
    schedulerJobId: 'string',
    schedulerJobName: 'string',
    cronExpression: 'string',
    inScheduled: 'bool'
  },
  isOrg: false,
  isApp: false
};

export const pitypesend_collection = {
  requiredFields: [
    '_id', 'piId', 'piType', 'orgId', 'orgName', 'attributeId', 'attributeName', 'piDesc', 'systemName'
  ],
  media: false,
  defaultValues: {
    piType: 'Send',
    piSendStatus: true
  },
  validate: {
    _id: 'objectId',
    piId: 'string',
    piType: 'string',
    orgId: 'string',
    orgName: 'string',
    attributeId: 'string',
    attributeName: 'string',
    piDesc: 'string',
    systemName: 'string',
    piSendStatus: 'bool'
  },
  isOrg: true,
  isApp: false
};

export const pitypereceive_collection = {
  requiredFields: [
    '_id', 'piId', 'piType', 'orgId', 'orgName', 'attributeId', 'attributeName', 'piDesc', 'systemName', 'tagNumber'
  ],
  media: false,
  defaultValues: {
    piType: 'Receive',
    piReceiveStatus: true
  },
  validate: {
    _id: 'objectId',
    piId: 'string',
    piType: 'string',
    orgId: 'string',
    orgName: 'string',
    attributeId: 'string',
    attributeName: 'string',
    piDesc: 'string',
    systemName: 'string',
    tagNumber: 'string',
    piReceiveStatus: 'bool'
  },
  isOrg: true,
  isApp: false
};

export const datasource_collection = {
  requiredFields: [
    'sysId', 'sysName'
  ],
  idMapping:["dataSourceId"],
  media: false,
  defaultValues: {
    active: true
  },
  validate: {
    _id: 'objectId',
    dataSourceId: 'string',
    sysId: 'string',
    sysName: 'string',
    active: 'bool'
  },
  isOrg: false,
  isApp: false
};

export const database_collection = {
  requiredFields: [
    '_id', 'queryId', 'dataBaseId', 'queryLogic'
  ],
  defaultValues: {
    queryLang: 'SQL'
  },
  validate: {
    _id: 'objectId',
    queryId: 'string',
    dataBaseId: 'string',
    queryLogic: 'string',
    queryLang: 'string'
  },
  media: false,
  isOrg: false,
  isApp: false
};

export const webservice_collection = {
  requiredFields: ['webserviceId', 'wsName', 'wsURL'],
  defaultValues: {
    active: true,
    method: 'GET',
    apiType: 'REST'
  },
  validate: {
    webserviceId: 'string',
    wsName: 'string',
    wsURL: 'string',
    active: 'bool',
    method: 'string',
    apiType: 'string'
  },
  media: false,
  isOrg: false,
  isApp: false
};

export const instance_collection = {
  requiredFields: ['type'],
  defaultValues: {
    isMasterDataInstance: false
  },
  validate: {
    _id: 'objectId',
    type: 'string',
    instanceId: 'string',
    instanceDesc: 'string',
    instanceLevel: 'string',
    instanceLevelName: 'string',
    instanceOrgLevel: 'string',
    entityLookupId: 'string',
    entityFormId: 'string',
    isMasterDataInstance: 'bool',
    instanceLocation: 'string',
    createdOn: 'date'
  },
  media: false,
  isOrg: false,
  isApp: false
};

export const organization_collection = {
  requiredFields: ['orgName', 'orgCode', 'orgDescription'],
  defaultValues: {},
  validate: {
    _id: 'objectId',
    orgName: 'string',
    orgCode: 'string',
    appName: 'string',
    orgDescription: 'string',
    createdOn: 'date'
  },
  lookupFields: {
    appName: {
      collection: 'Apps',
      field: 'appName'
    }
  },
  media: false,
  isOrg: false,
  isApp: true
};

export const apps_collection = {
  requiredFields: ['appName', 'appDescription'],
  defaultValues: {
    appStatus: 'active'
  },
  validate: {
    _id: 'objectId',
    appId: 'string',
    appName: 'string',
    appDescription: 'string',
    appClassification: 'string',
    adminRole: 'string',
    appOwner: 'string',
    appContact: 'string',
    appLogo: 'binary',
    appLogoName: 'string',
    appLogoType: 'string',
    appStatus: 'string',
    createdOn: 'date'
  },
  media: true,
  isOrg: false,
  isApp: false
};

export const entity_data_collection = {
  requiredFields: ['dataId', 'type', 'data'],
  defaultValues: {},
  validate: {
    _id: 'objectId',
    dataId: 'string',
    entityOrInstanceId: 'string',
    type: 'string',
    data: 'object',
    createdOn: 'date'
  },
  media: false,
  isOrg: false,
  isApp: false
};

export const hidden_collection = [
  'documents.chunks',
  'documents.files',
  'email_attachments.chunks',
  'email_attachments.files',
  'report_images.chunks',
  'report_images.files',
  'images.chunks',
  'images.files'
];
