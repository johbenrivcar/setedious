/**
 * Provides a complete service for accessing - reading from and writing to - the crossword database
 * 
 * 
 */

module.exports = {
    connect: connect
    , on: onEvent 
    , onEvent: onEvent
    , onDataset: onDataset
    , execSql: execSql
    , verbose: false
    , log: console.log
}


function emptyFunction(){ return; };

verbLog(">>>>>>>>>>>>>>>>>  SeTedious STARTING >>>>>>>>>>>>>>>>>>");



//var params = require("./DBParameters.json");
//const fs = require('fs')
//let params = JSON.parse(fs.readFileSync('DBParameters.json', 'utf-8'))
var Connection = require( "tedious" ).Connection;
var Request = require( "tedious" ).Request;
var TYPES = require( "tedious" ).TYPES;

module.exports.TDS_Connection = Connection;
module.exports.TDS_Request = Request;
module.exports.TDS_TYPES = TYPES;

var waitingFreeConnection = false;
var params = null;
var tediousConfig = null ;

var bDisconnect = false;
var bError = false;
var errData = null;
var bReady = false;
var bConnectionPending = false;


const connectionPool = [];
var connectionCount = 0;
var connectionPoolLimit = 5;

const requestQueue = [];
const connectionRequestQueue = [];


function connect( options ){
    if( !options.tedious ){ throw new Error( "Connection options must include [tedious] configuration"); }
    if( !options.tedious.options ) options.tedious.options = {};
    let opt = options.tedious.options;
    {
        opt.rowCollectionOnDone = false;
        opt.useColumnNames =  false;
        opt.rowCollectionOnRequestCompletion =  false;
    }
    params = options;
    if( params.connectionPoolLimit ) connectionPoolLimit = params.connectionPoolLimit ;
    tediousConfig = params.tedious ;
    coreLog( "Configuration:", tediousConfig)
    newConnection();
}

function getFreeConnection( callback ){   
    connectionPoolLimit++;
    connectionRequestQueue.push( callback );
    setTimeout( checkRequestQueue, 0 );

}

function newConnection( ){
    verbLog( ">>newConnection");
    let cnx = new Connection( tediousConfig );
    connectionCount++;
    cnx.on( "connect", function( err ){
        newConnectionMade(err, cnx);
     } );
    bConnectionPending  = true;
    cnx.connect();
    verbLog( "<<newConnection (connection pending)");
}




// Evemt handlers list for different event types
const onEvents = {
    ready: []
    , error: []
    , disconnect: []
}

const onResultSetHandlers = {};



function newConnectionMade( err, newCNX ){
    verbLog( ">> newConnectionMade" );
    if( err ){
        coreLog( "Error attempting to connect:", err)
        bError =  true;
        errData = err;
        doCallbacks( onEvents.error, err );
        verbLog( "<< newConnectionMade" );
        return;
    }

    connectionPool.push( newCNX )
    coreLog( `New connection added connection to pool, connection count [${connectionCount}], free pool size is now [${connectionPool.length}]`);
    //clearTimeout( cnxTimeout );
    
    bConnectionPending = false;
    
    if( !bReady) {
        bReady = true;
        doCallbacks( onEvents.ready );
    }

    
    setTimeout( checkRequestQueue, 10 );

    verbLog( "checkRequestQueue scheduled" );
    verbLog( "<< newConnectionMade" );


}




// ====================================================================
// PUBLIC FUNCTIONS
// ====================================================================
function execSql( sql, callback, context ){
    
    verbLog(`>> exec( [${sql}] )`);

    // Define a variable to hold all the result sets
    let sets = {};
    // Create the new request to be executed given the SQL statement
    // provided
    let request = new Request(  
        sql,

        // This function is called when the whole request has been completed
        // Its purpose is to return all the resultsets to the callback function
        function requestComplete( err, rowCount, rows ){
            verbLog( ">> requestComplete")
            verbLog( `Exec fininished for [${sql}]`)

            if( err ){ 
                    coreLog(`--- ERROR REPORTED ON EXEC `, err );
                    errObj = { setName: "ERROR", ERROR: [ err ] }
                    if( callback ) callback( errObj ); 
                    errData = errObj; 
                    bError = true; 
                    doCallbacks( onEvents.error, errObj ); 
                    verbLog( "<< requestComplete - Error reported");
                    try{
                        
                        request.XWDB_connection.close();
                    } catch(e){};
                    connectionCount--;
                    setTimeout( checkRequestQueue, 10 );
                    return ;
                };
            
            verbLog( `Execution was successful`);
            let cnxx = request.XWDB_connection;
            cnxx.reset( function( err ){ 
                    if( err ){
                        coreLog(`--- ERROR Connection reset failed`, err )
                        try{
                            cnxx.close();
                        } catch(e){};
                        connectionCount--;
                        setTimeout( checkRequestQueue, 10 );
                        verbLog( `Check of request queue has been scheduled`)
                        return ;
                    }
                    coreLog( "CONNECTION RESET SUCCESSFULLY");
                    connectionPool.push( cnxx );
                    verbLog( `Connection returned into pool, length is now [${connectionPool.length}]`);
                    setTimeout( checkRequestQueue, 1 );
                    verbLog( `Check of request queue has been scheduled`)
                }
            )

            // Remove the reference to the connection from the request object
            request.XWDB_connection = null;

            // check if there are any handlers pre-registered for these result sets
            let setNames = Object.keys( sets );
            setNames.forEach( setName =>{
                let handlers = onResultSetHandlers[setName]
                if( handlers ){
                    handlers.forEach( handler =>{
                        let xo = { };
                        xo.setName = setName;
                        xo[setName] = sets[setName] ;
                        handler( xo, context );
                    });
                };
            });

            if( callback ) {

                // check if there is an ERROR dataset
                let errorSet = null;
                if ( sets.ERROR ){
                    // make a callback with the error set in the error position
                    errorSet = { setName: "ERROR" , ERROR: sets.ERROR }
                    delete sets.ERROR
                }
                verbLog( `Calling back to original requester`)
                callback( errorSet, sets, context );
            }
            verbLog( "<< requestComplete" )

        }
    );
    
    // =--------------------------------------------=======
    // The event handler to be called for each row returned
    // By convention, the first column is [setname] and the
    // value in this column identifies the set into which to
    // deliver the rows
    request.on( "row", function( rowOfCols ){
        let col0 = rowOfCols[0];
        let setName = "DATASET"
        if( col0.metadata.colName.toLowerCase() == "setname" ){
            setName = col0.value; 
        } 
        // Check that the set array has been defined
        if( !sets[setName] ) { 
            sets[setName] = [];
            // if( params.includeMetadata ){
            //     sets[setName].push( getMetadataForRow( rowOfCols ) );
            // }
        }

        // Convert the given row into our standard row object
        let oRow = convertRowToObject( rowOfCols );

        //oRow.ResultsetNumber = request.CXWDB_setNumber;

        // Add the row object to the set
        sets[setName].push( oRow );

        
    })

    requestQueue.push( request );
    verbLog( `Added request to request queue, length=[${requestQueue.length}]`)
    setTimeout( checkRequestQueue, 10 );
    verbLog( `Scheduled checkRequestQueue`);
    verbLog(`<< exec`);
}


function checkRequestQueue(){
    verbLog(`>> checkRequestQueue - CXQ length=[${connectionRequestQueue.length}], RQ length=[${requestQueue.length}], CP length=[${connectionPool.length}]`);

    // Check if there are any requests waiting to be serviced
    if( requestQueue.length == 0 &&  connectionRequestQueue.length == 0 ) {
        verbLog(`<<checkRequestQueue - no requests waiting`);
        return;
    }

    // Check if there are any free connections available
    if( connectionPool.length == 0 ) { 
        // No free connections
        // Have we reached the connection limit (set by user)
        if ( connectionPoolLimit <= connectionCount ){ 
            // Log this situation if it has just changed
            if( !waitingFreeConnection ) coreLog( `<< checkRequestQueue - connection limit [${connectionPoolLimit}] reached, waiting for a free connection` ); 
            // set the flag to indicate that we are waiting for a free connection
            waitingFreeConnection = true;
            return; 
        }

        // We have not reached the connection limit, but check if there is a new connection
        // already being opened, and the result is still pending?
        if (bConnectionPending) { 
            // Waiting for the connection to open so nothing we can do
            verbLog( '<< checkRequestQueue - Connection still pending..') ; 
            return;
        }

        // We have not reached the connection limit, and there are no pending connections
        // so we can start the process of opening a new connection
        verbLog( `Creating new connection`)
        newConnection(); 

        // Now we are in connection pending state, so we just have to wait for now
        verbLog(`<< checkRequestQueue - New connection requested, connecton pending`);
        return; 
    }

    // There are outstanding requests that need a connection, and at least one connection is free
    waitingFreeConnection = false;
    
    // Get the first free connection
    let xcnx = connectionPool.shift();

    // Check if there has been an external request for a free connection to this database
    if( connectionRequestQueue.length > 0 ){
        // If so, we hand over the free connection to the callback

        verbLog( "Handing over free connection to callback");

        // Get the connection request callback function
        let cnxr = connectionRequestQueue.shift();

        // Call the callback with the connection object
        if( cnxr ) cnxr( xcnx );

    } else {
        // There must be a request in the request queue
        verbLog( "Running next request from request queue");

        // Get the request object from the request queue
        let req = requestQueue.shift();

        // Set the connection property to the connection we have found
        req.XWDB_connection = xcnx;
        
        // Execute the request on the found connection
        xcnx.execSql( req );
    };

    // Now check if there are still and items in either request queue, and if so schedule another call to this function
    if( requestQueue.length > 0 || connectionRequestQueue.length > 0 ) { setImmediate( checkRequestQueue ) } ;

    // Our job is done, so we can exit

    verbLog(`<<checkRequestQueue - CXQ length=[${connectionRequestQueue.length}], RQ length=[${requestQueue.length}], CP length=[${connectionPool.length}]`);

    return;

}

/**
 * This function registers a callback to be executed when some system event occurs. Possible events are
 * ready, error, and disconnect.
 * @param {*} event 
 * @param {*} callback 
 */
function onEvent( event, callback ){
    verbLog(`>>onEvent [${event}]`);
    switch( event.toLowerCase() ){
        case "ready":
            if( bReady ){ callback(); verbLog(`<<onEvent`); return };
            break;
        case "error":

            if( bError ){ callback( errData ); };
            break;
        case "disconnect":
            if( bDisconnect ){ callback(); verbLog(`<<onEvent`); return };
            break;
        default: 

    }
    
    onEvents[ event ].push( callback )

    verbLog(`<<onEvent`);
}

/**
 * This function registers a callback to be executed whenever a data set with a specific data set
 * name is returned from any SQL call. This means a handler can be registered for generic activities
 * which can be invoked from within SPs simply by selecting a dataset with the required name. The data
 * in the dataset is sent to the callback
 * @param {*} setName 
 * @param {*} handler 
 */
function onDataset( setName, handler ){

    // Check if this set name needs to be added
    if( !onResultSetHandlers[setName] ) onResultSetHandlers[setName] = [];

    // Add the callback function to the handler list.
    onResultSetHandlers[setName].push( handler );

}

/**
 * This function calls back all the callback functions in a given list, with the given parameters
 * @param {*} cbList 
 * @param {*} data 
 */
function doCallbacks( cbList, ...params ){
    cbList.forEach( cb => {
        cb( ...params );
    })
};

/**
 * This function converts a row returned from a SQL statement being executed into
 * a row of data suitable for returning in a dataset. The column names and values
 * are returned as key/value pairs in the row object. If the column name ends with
 * the string _json, then the string value of the column is converted using
 * JSON.parse into a javascript object, which is returned as another column using
 * the same column name but without the _json suffix.
 * @param {*} row 
 */
function convertRowToObject( row ){
    ro={};
    row.forEach( (col, ix)=>{
        let colName = col.metadata.colName;
        // check that this is not the setName column
        if( colName.toLowerCase() != "setname" ){
            let val = col.value;

            if( params.includeMetadata ){
                ro[ colName + "_" ] = col.metadata;
            };

            // check for json object in this column
            if( colName.substr( -5 ).toLowerCase() === "_json"){
                if( typeof val == "string" ){

                    // try to convert to a javascript object
                    try{ 

                        let obj = JSON.parse( val );
                        if ( obj ) {
                            obj = preprocessJSON ( obj );
                        }
                        // remove the _json suffix from the name
                        let oColName = colName.substr(0, colName.length - 5);

                        // set the object value of the column
                        ro[oColName]=obj;

                    } catch(e){

                    }

                }
            } else ro[colName]=val;
        }

    })
    return ro;
}

/**
 * Returns a row object containing only the metadata for all the fields
 * in the row, with an underscore _ appended to each field name.
 * @param {*} row 
 */
function getMetadataForRow( row , outRow = null ){
    if( !outRow ) outRow={};
    row.forEach( (col, ix)=>{
        let colName = col.metadata.colName;
        if( ix > 0 || colName.toLowerCase() != "setname" ) ro[colName + "_" ]=col.metadata;
    })
    return ro;
}
function coreLog( ...args ){
    log( "setedious", ...args );
}

function verbLog( ...args ){
    if( module.exports.verbose ) log( "setedious-verbose", ...args );
}

function log( xModuleName, ...args ){
    let xhhmm = hhmmss();
    //setImmediate( function(){ 
        module.exports.log( `${xhhmm}|${xModuleName}|` , ...args ) ; xhhmm = null; 
    //} );

}
// ========================================================================================== dts
function hhmmss( ddd ){ 
    if( !ddd ) ddd = new Date();
    return ddd.toISOString().substr(11,8);
 }

 
// ========================================================================================== simpleClone

function simpleClone( pObject, excludeKey = "", depth = 1 ){
// TODO This does not handle arrays! ??
if( depth == 1 ) console.log( "CLONING", pObject )


if( depth > 10 ) return "[TOO DEEP]";
if( !pObject ) return null;

if( Array.isArray( pObject ) ){
    let newA = [];
    pObject.forEach( item=>{
        let xo = simpleClone( item, excludeKey, depth+1 );
        if( xo ) newA.push( xo );
    })
    if ( depth == 1) console.log( "RETURNING CLONE" , newA )
    return newA;

} else if ( pObject instanceof Date ) { 
    return new Date( pObject );
} else if ( pObject instanceof Function ) {
    return null;
} else {
    newO = {};
    var keys = Object.keys( pObject );
    keys.forEach( K => {
        if( K != excludeKey )
        if( K.substr( -1 )!="_" ) {
        //if( K != "__proto__")
            let po = pObject[K];
            if(  po instanceof Function  ) { return; } 
            else if( po instanceof Date ) { newO[K] = new Date( po ) }
            else if( typeof po == "object" || Array.isArray( po ) ) { 
                let xo = simpleClone ( po, excludeKey, depth+1 ) 
                if( xo ) newO[K] = xo
            } else newO[K] = po;
        }
        return;
    })

    if ( depth == 1) console.log( "RETURNING CLONE" , newO )

    if ( Object.keys( newO ).length == 0 && depth > 1 ) return null;
    return newO;
}

}

// ========================================================================================== util_preprocessJSON
/**
* Takes an object or any item that has been constructed using JSON.parse(), and converts all data
* items whose string values can be represented as valid JS types. The data values are changed in situ
* if the top-level entry is an object, and the converted value/object is also returned.
* @param {*} entry 
*/
function preprocessJSON( entry ){
//console.log( "preprocessing", entry);
// Pre-process the body to convert text values that are numbers, boolean
// or dates into corresponding types.
if( typeof entry === "string" ) return stringToElementaryType( entry );

// Maybe it is an (array or object )
if( typeof entry === "object" ){

    // forEach method indicates an array
    if( entry.forEach ){
        try { 
            entry.forEach( (item, index)=>{
                    entry[index] = preprocessJSON( item );
                })
            return entry;

        } catch (e) {
            console.error( e )
            return null;
        };

    }
    
    // otherwise try it out as an object
    for( let [key, value] of Object.entries( entry )){
        entry[key] = preprocessJSON( value )
    }
}


return entry;

}

// ======================================================================================================= stringToElementaryType
function checkInt(xx){
    let int_regexp = /^[0-9]+$/g                 // regular expression to check integer value
    return int_regexp.test( xx )
}
function checkFlt(xx){
    let flt_regexp = /^[0-9]+\.[0-9]+$/g         // regular expression to check for decimal (n.n) value
    return flt_regexp.test( xx );
}
/**
 * Recasts a string as one of the javascript basic types, by checking convertibility. If no
 * conversion is possible returns the string. Types are Integer, Number (Float), Boolean and Date
 * @param {*} xxx String to be converted to an elementary type if possible.
 */
function stringToElementaryType( xxx ){
    //console.log( "string", typeof xxx , xxx)
    if ( xxx.length > 0 ) {

        // most likely to be a number, so try that first
        if(checkInt( xxx )){ //console.log( "..>INT"); 
            return parseInt( xxx ); }
        if(checkFlt( xxx )){ //console.log( "..>FLT"); 
            return parseFloat( xxx ); }

        
        // Try for boolean values
        if ( xxx === "true" ) {//console.log( "true" );  
            return true;}
        if ( xxx === "false" ) {//console.log( "false" );  
            return false;}

        //try a date
        let dd = null;
        try { 
            dd = new Date( xxx );
             if( dd instanceof Date && !isNaN(dd) ) return dd
        } catch(e) {};
        
    }
    // can't do anything, so just return the string;
    //console.log( "..>str")
    return xxx;
}

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
