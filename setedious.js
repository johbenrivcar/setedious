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
    
    //var TYPES = require( "tedious" ).TYPES;

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


    const requestQueue = [];
    


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

                if(err){ 
                        coreLog(`--- ERROR REPORTED ON EXEC `, err );
                        callback(err); 
                        errData = err; 
                        bError = true; 
                        doCallbacks( onEvents.error, err ); 
                        verbLog( "<< requestComplete");
                        return ;
                    };
                
                verbLog( `Execution was successful`);

                connectionPool.push( request.XWDB_connection );
                verbLog( `Connection returned into pool, length is now [${connectionPool.length}]`);

                
                setTimeout( checkRequestQueue, 10 );

                verbLog( `Check of request queue has been scheduled`)
                
                //log( "Calling back with sets:", sets )

                // check if there are any handlers pre-registered for these result sets
                let setNames = Object.keys( sets );
                setNames.forEach( setName =>{
                    let handlers = onResultSetHandlers[setName]
                    if( handlers ){
                        handlers.forEach( handler =>{
                            let xo = { };
                            xo[setName] = sets[setName] ;
                            xo.setName = setName;
                            handler( xo, context );
                        });
                    };
                });

                verbLog( `Calling back to original requester`)
                if( callback ) callback( null, sets, context );

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
                if( params.includeMetadata ){
                    sets[setName].push( getMetadataRow( rowOfCols ) );
                }
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
        verbLog(`>> checkRequestQueue - RQ length=[${requestQueue.length}], CP length=[${connectionPool.length}]`);

        if( requestQueue.length == 0) {
            verbLog(`<<checkRequestQueue`);
            return;
        }

        if( connectionPool.length == 0 ) { 
            if ( connectionPoolLimit <= connectionCount ){ coreLog( `<< connectionRequestQueue - connection limit [${connectionPoolLimit}] reached` ); return; }
            if (bConnectionPending) { verbLog( '<< checkRequestQueue - Connection still pending..') ; return;}
            verbLog( `Creating new connection`)
            newConnection(); 
            verbLog(`<< checkRequestQueue - New connection requested`);
            return; 
        }

        verbLog( "Running next request from request queue");
        //log( `Connection pool` , connectionPool );
        
        let xcnx = connectionPool.shift();

        let req = requestQueue.shift();

        req.XWDB_connection = xcnx;

        xcnx.execSql( req );

        if( requestQueue.length > 0 ) { setImmediate( checkRequestQueue ) } ;

        verbLog(`<<checkRequestQueue, - RQ length=[${requestQueue.length}], CP length=[${connectionPool.length}]`);

    }

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

    function onDataset( setName, handler ){
        if( !onResultSetHandlers[setName] ) onResultSetHandlers[setName] = [];
        onResultSetHandlers[setName].push( handler );

    }


    function doCallbacks( cbList, data = {} ){
        cbList.forEach( cb => {
            cb( data );
        })
    };

    // function convertRowsToObjects( rows ){
    //     let rowsOut = [];
    //     rows.forEach( row => {
            
    //         rowsOut.push( convertRowToObject(row) );
    //     })

    //     return rowsOut;
    // }

    function convertRowToObject( row ){
        ro={};
        row.forEach( (col, ix)=>{
            let colName = col.metadata.colName;
            if( ix > 0 || colName.toLowerCase() != "setname" ) ro[colName]=col.value;
        })
        return ro;
    }

    function getMetadataRow( row ){
        ro={};
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

            // try a date
            // let dd = null;
            // try { 
            //     dd = new Date( str );
            //     if( dd ) return dd
            // } catch(e) {};
            
        }
        // can't do anything, so just return the string;
        //console.log( "..>str")
        return xxx;
    }

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
