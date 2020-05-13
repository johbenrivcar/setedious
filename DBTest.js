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
    

setedious.onDataset( "SSM", function( set , count ){
    let ds = set.SSM;
    log( `SSM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "SPPARAM", function( set , count ){
    let ds = set.SPPARAM;
    log( `SPPARAM set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "PSN", function( set , count ){
    let ds = set.PSN;
    log( `PSN set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "GRP", function( set , count ){
    let ds = set.GRP;
    log( `GRP set collected with ${ds.length} rows`)
    log( set.setName, ds );
})

setedious.onDataset( "ERROR", function( set , context ){
    let ds = set.ERROR
    log( `ERROR set  with ${ds.length} rows!!`, ds);
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

    sql = " SELECT TOP(1) 'PSN' setName, PSN.* FROM vPSN_Person PSN ORDER BY PSN.Name ; " ;
    sql += ` EXEC getPerson @PersonUID='123456789012345' ;`
    sql +=  " EXEC GetSpParams @SPName='getPerson' ; "
    sql += " EXEC	[RaiseError] @Msg = 'TEST ERROR', @Enum = -300, @Data_JSON = '{}' ; "
    sql += ` SELECT TOP(1) 'GRP' setName, GRP.* FROM GRP_Group GRP; `
    setedious.execSql( sql ) ;

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