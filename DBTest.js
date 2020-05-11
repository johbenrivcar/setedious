const fs = require( "fs" );
let logfile = fs.openSync( "./logs/DBTest.log", "w" );
const log = logToDisk ; //console.log;
const util = require("util");

log( (new Date() ).toISOString() );
var execCount = 0

log( "Starting DBTest ");


const setedious = require( "./setedious" );
//setedious.verbose = true;
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
    log( `SSM set collected from SQLQuery#[${count}] with ${ds.length} rows!!`)
    log( set.setName, ds );
})

setedious.onDataset( "PSN", function( set , count ){
    let ds = set.PSN
    log( `PSN set collected from SQLQuery#[${count}]  with ${ds.length} rows!!`)
    log(  set.setName, ds  );
})

function readData(){
    
    let sql = " SELECT 'SSM' AS setName, SSM.* FROM SSM_SessionMaster SSM; SELECT 'PSN' AS setName, PSN.* FROM PSN_Person PSN; EXEC TESTPROC @from=20, @to=100;"
    
    ++execCount;
    setedious.execSql( sql , null, execCount ); //, ProcessResultSets, ++execCount );
    ++execCount;
    sql = `EXEC getSessionData @sessionCode='oasduriaosdfu';` ;
    setedious.execSql( sql , function( err, session ){
        log( "Session:", session );
    } ); //, ProcessResultSets, ++execCount );
    
    //DBService.exec( sql, ProcessResultSets );
    setTimeout( readData, 10 );
}

//DBService.on( "ready" , readData );

readData();

function ProcessResultSets( err, resultSets, id){
    log( `>> ProcessResulsteSets [${id}]`)
    if( err ){
        log(" ERROR +++++ ", err);
        return;
    }

    log( "Read was successful " );
    
    let setNames = Object.keys( resultSets );

    setNames.forEach( setName=>{
        let aSet = resultSets[setName];
        log( `Reporting resultset ${setName} with ${aSet.length} rows ----------------`)
        // aSet.forEach( ( row, ix ) =>{
        //     log( ix, row );
        //  });

    });
    

}


function logToDisk( ...args ){
    console.log( ...args );
    let rec="";
    args.forEach( arg=>{
        rec += "|+| " + util.inspect( arg );
    })
    fs.writeSync(logfile, rec + "\n", "utf8");

}