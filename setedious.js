/**
 * Provides a complete service for accessing - reading from and writing to - the crossword database
 * 
 * 
 */

    module.exports = {
        connect: connect
        , on: onEvent 
        , onEvent: onEvent
        , onDataSet: onDataset
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
                            handler( sets[setName] , context );
                        });
                    };
                });

                verbLog( `Calling back to original requester`)
                if( callback ) callback( null, sets, context );

                verbLog( "<< requestComplete" )

            }
        );
        
        // request.CXWDB_setNumber = 0;
        // request.CXWDB_sets = sets;
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
            if( !sets[setName] ) sets[setName] = [];

            // Convert the given row into our standard row object
            let oRow = convertRowToObject( rowOfCols );

            //oRow.ResultsetNumber = request.CXWDB_setNumber;

            // Add the row object to the set
            sets[setName].push( oRow );

            
        })

        // request.on('doneInProc',function(rowCount, more, rows){
        //     request.CXWDB_setNumber++ ;
        //     // Now process the actual callback
        //     // log( `Calling back after exec is complete, more=${more}`);
        //     // let resultSet = { setNumber : request.CXWDB_setNumber };
            
        //     // switch ( config.options.useColumnNames ) {
        //     //     case true:
        //     //         resultSet.rows = rows;
        //     //         break;
        //     //     default: 
        //     //         resultSet.rows = convertRowsToObjects(rows);
        //     //         break;
        //     // }
        //     // callback( null, rowCount, resultSet );
        //     // log( `callback done!`)
        // });

        // check that there is a free connection

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