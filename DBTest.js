
const log = console.log;

var execCount = 0

log( "Starting DBTest ");


const DBService = require( "./setedious" );

DBService.connect( {
        connectionPoolLimit: 10
        
        , includeMetadata: true 

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
    

DBService.onDataset( "TOI", function( set , count ){
    log( `TOI set collected from #[${count}] with ${set.length} rows!!`)
    log( set[0] );
})

DBService.onDataset( "PSN", function( set , count ){
    log( `PSN set collected from #[${count}]  with ${set.length} rows!!`)
    log( set[0] );
})

function readData(){
    
    let sql = " SELECT 'TOI' AS setName, TOI.* FROM dbo.tfTableOfIntegers(1, 10) TOI; SELECT 'PSN' AS setName, PSN.* FROM PSN_Person PSN; EXEC TESTPROC @from=20, @to=100;"
    //let sql = "select * from dbo.tfTableOfIntegers(1, 10);"
    ++execCount;
    DBService.execSql( sql , null, execCount ); //, ProcessResultSets, ++execCount );
    ++execCount;
    DBService.execSql( sql , null, execCount ); //, ProcessResultSets, ++execCount );
   
    //DBService.exec( sql, ProcessResultSets );
    //setTimeout( readData, 10 );
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

