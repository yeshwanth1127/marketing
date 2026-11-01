export const connectors=[
{id:'meta',name:'Meta Ads',category:'Advertising',description:'Campaigns, ad sets, budgets and performance',permissions:'Read + write',status:'not_connected'},
{id:'google-ads',name:'Google Ads',category:'Advertising',description:'Search, display and YouTube campaigns',permissions:'Read + write',status:'not_connected'},
{id:'instagram',name:'Instagram',category:'Publishing',description:'Reels, carousels, comments and messages',permissions:'Read + write',status:'not_connected'},
{id:'facebook',name:'Facebook',category:'Publishing',description:'Pages, posts and community replies',permissions:'Read + write',status:'not_connected'},
{id:'whatsapp',name:'WhatsApp Business',category:'Messaging',description:'Approved broadcasts and inbound conversations',permissions:'Read + write',status:'not_connected'},
{id:'youtube',name:'YouTube',category:'Publishing',description:'Video uploads and channel performance',permissions:'Read + write',status:'not_connected'},
{id:'ga4',name:'Google Analytics 4',category:'Measurement',description:'Traffic, events and conversion reporting',permissions:'Read only',status:'not_connected'},
{id:'gsc',name:'Search Console',category:'Measurement',description:'Queries, pages and search visibility',permissions:'Read only',status:'not_connected'},
{id:'cms',name:'Website / CMS',category:'Publishing',description:'Approved articles and landing pages',permissions:'Write',status:'not_connected'}];
export async function executeConnector(){throw new Error('CONNECTOR_NOT_CONFIGURED: external publishing is deferred. No action was sent.');}
