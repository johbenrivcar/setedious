const fs = require( "fs" );
let logfile = fs.openSync( "./logs/DBTest.log", "w" );
const log = logToDisk ; //console.log;
const util = require("util");


log( "Starting DBTest at",  (new Date() ).toISOString() );


const setedious = require( "./setedious" );
setedious.verbose = false;
setedious.log = logToDisk;

setedious.connect( {
        connectionPoolLimit: 10
        
        , includeMetadata: false 

        , tedious: {
            server: "DESDEMONA"
            , authentication: {
                type: "default"
                , options: { 
                    userName: "CrosswordDB_RW"
                    , password: "2390asdfoiadlzxjbhkxjxhiausdkfajslvx8"
                }
            }
            , options: {
                database: "CrosswordDB"
                , "trustServerCertificate": true
            }
        }
    }
)
    

setedious.onDataset( "ssm", function( set  ){
    let ds = set.ssm;
    log( `SSM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "spparam", function( set  ){
    let ds = set.spparam;
    log( `SPPARAM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "psn", function( set  ){
    let ds = set.psn;
    log( `PSN set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "grp", function( set ){
    let ds = set.grp;
    log( `GRP set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "errors", function( set  ){
    let ds = set.errors
    log( `ERRORS set  with ${ds.length} rows!!`, ds);
})

setedious.onDataset( "error", function( set  ){
    let ds = set.error; // This is always only a single error
    log( `ERROR object is  `, ds);
})
function runTest(){
/*
    let sql = " SELECT 'SSM' AS setName, SSM.* FROM SSM_SessionMaster SSM; "
    
    setedious.execSql( sql ); 

*/

    // sql = " SELECT 'PSN' setName, PSN.* FROM vPSN_Person PSN ORDER BY PSN.Name ; EXEC sysGetSpParams @SPName='getPerson' ;" ;

    // setedious.execSql( sql ) ;

    // setedious.execSql( "EXEC sysGetSpParams @SPName='getPerson', @Debug=1 ; ", function( err, ds ){
    //     if( err ){
    //         log( "ERROR RETURNED", err );
    //     }

    //     log( "SPPARAMS FOR getPerson", err, ds )
    // })
    var sql1 ;

    sql1 = " SELECT TOP(3) 'PSN' setName, PSN.* FROM vPSN_Person PSN ORDER BY PSN.Name ; "

    setedious.execSql( sql1, 
        function( data ){
            // if( data.errors ){
            //     log( "THERE ARE ERRORSin SQL1", data.errors );
            //     delete data.errors
            //     delete data.error
            // }

            log( "SQL1 Retuslts---", data);

        }

    );

    var sql2;
    sql2 = [ ` EXEC getPerson @PersonUID='123456789012345' ;`
            ," EXEC GetSpParams @SPName='getPerson' ; " ]

            setedious.execSql( sql2, 
                function( data ){
                    // if( data.errors ){
                    //     log( "THERE ARE ERRORS in SQL2", data.errors );
                    //     //delete data.errors
                    //     //delete data.error
                    // }
        
                    log( "SQL2 Results---", data);
        
                }
        
            );
        
    var sql3;
    sql3 = " EXEC	[RaiseError] @Msg = 'TEST ERROR', @Enum = -300, @Data_JSON = '{}' ; "
    sql3 += ` SELECT TOP(1) 'GRP' setName, GRP.* FROM GRP_Group GRP; `
    setedious.execSql( sql3, 
            function( data ){
                // if( data.errors ){
                //     log( "THERE ARE ERRORS IN SQL3", data.errors );
                //     delete data.errors
                //     delete data.error
                // }

                log( "SQL3 All the non-error data", data);

            }

    );

}



runTest();



function logToDisk( ...args ){
    console.log( ...args );
    let rec="";
    args.forEach( arg=>{
        rec += "|+| " + util.inspect( arg );
    })
    fs.writeSync(logfile, rec + "\n", "utf8");

}