const fs = require( "fs" );
let logfile = fs.openSync( "./logs/DBTest.log", "w" );
const log = logToDisk ; //console.log;
const util = require("util");


log( "Starting DBTest at",  (new Date() ).toISOString() );


const setedious = require( "./setedious" );

const SQLRunner = setedious.SQLRunner


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
    
let RunnerA = new SQLRunner();



RunnerA.on( "ssm", function( set  ){
    let ds = set;
    log( `SSM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

RunnerA.on( "spparam", function( set  ){
    let ds = set;
    log( `SPPARAM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

RunnerA.on( "psn", function( set  ){
    log( "PSN SET", set)
    let ds = set;
    log( `PSN set collected with ${ds.length} rows`)
    log( ds );
})

RunnerA.on( "grp", function( set ){
    let ds = set;
    log( `GRP set collected with ${ds.length} rows`)
    log( ds );
})

RunnerA.on( "errors", function( set  ){
    let ds = set
    log( `ERRORS set  with ${ds.length} rows!!`, ds);
})

RunnerA.on( "error", function( set  ){
    let ds = set; // This is always only a single error
    log( `ERROR object is  `, ds);
})


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

    sql1 = " SELECT TOP(10) 'PSN' setName, PSN.* FROM vPSN_Person PSN ORDER BY PSN.Name ; "

    
    RunnerA.run( sql1 );

    // var sql2;
    // sql2 = [ ` EXEC getPerson @PersonUID='123456789012345' ;`
    //         ," EXEC GetSpParams @SPName='getPerson' ; " ]

    //         setedious.execSql( sql2, 
    //             function( data ){
    //                 // if( data.errors ){
    //                 //     log( "THERE ARE ERRORS in SQL2", data.errors );
    //                 //     //delete data.errors
    //                 //     //delete data.error
    //                 // }
        
    //                 log( "SQL2 Results---", data);
        
    //             }
        
    //         );
        
    // var sql3;
    // sql3 = " EXEC	[RaiseError] @Msg = 'TEST ERROR', @Enum = -300, @Data_JSON = '{}' ; "
    // sql3 += ` SELECT TOP(1) 'GRP' setName, GRP.* FROM GRP_Group GRP; `
    // setedious.execSql( sql3, 
    //         function( data ){
    //             // if( data.errors ){
    //             //     log( "THERE ARE ERRORS IN SQL3", data.errors );
    //             //     delete data.errors
    //             //     delete data.error
    //             // }

    //             log( "SQL3 All the non-error data", data);

    //         }

    // );


function logToDisk( ...args ){
    console.log( ...args );
    let rec="";
    args.forEach( arg=>{
        rec += "|+|" + util.inspect( arg );
    })
    fs.writeSync(logfile, rec + "\n", "utf8");

}