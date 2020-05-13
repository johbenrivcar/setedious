# setedious
A wrapper for [tedious] that returns named data sets from multiple SQL Selects, or SP calls.

Basic features
* Simple submission of SQL statements with a callback:
    
        setedious.execSql( sqlStatement, callback );
    *The callback receives a single object containing all the datasets created by the SQL statement, including all datasets selected with stored procedure calls*

* Events to catch datasets with specific names whenever returned
    
        setedious.onDataset( datasetName, callback );
    *The callback receives an object containing the a dataset whenever that named dataset is returned by any submitted SQL statement*
    
## installation
Node.js is a prerequisite of setedious. To install setedious in a project use:

    > npm install setedious

setedious has a dependency on *tedious* which will also be installed if required.

## usage example
    // load module and make connection to the database
    const setedious = require( `setedious` );
    setedious.connect( connectOptions );

    // register a handler called whenever "myNamedSet" is returned
    setedious.onDataset( "myNamedSet", dataSet=>{
        console.log( `dataSet 'myNamedSet' has been returned` );
        console.log( dataSet.myNamedSet );
    });

The above handler will be called whenever any sql statement submitted to setedious returns a dataset named "myNamedSet".

    // create and submit the SQL, with handler for all datasets
    let sql = "SELECT 'myNamedSet' setName, * FROM myTable;"
             + " SELECT 'anotherSet' setName, * FROM anoTable; ";
    
The above SQL statement will return two datasets, named "myNamedSet" and "anotherSet". Empty datasets are not returned.

    // execute both select statements and collect the returned
    // datasets in a callback.
    setedious.execSQL( sql , (err, allDataSets )=>{
        if( err ){
            console.log( "ERROR REPORTED", err)
        }
        console.log("All data sets", allDataSets );
    });

The above js statement will execute the SQL, and return the datasets back to the callback. If a dataset with the name ERROR is returned from the call, that will be returned in the parameter err.


### setName column in SQL statements
To correctly allocate returned data rows to a named dataSet, the first column of a result set must be named **setName** and be set to the string name of the dataset:

*Example*

    SELECT "PERSONS" setName, * FROM T_PERSONS;
**NOTES**
 * If there is no setName column, then the set name defaults to **dataSet**. 
* If multiple SQL statements in a single request return rows with the **same** *setName* then all the rows returned from those SQL statements are concatenated in a single dataset.
* If different rows returned from a single SQL statement have a different *setName*, then the rows will be separated into multiple dataSets with different names. This means you can allocate the value of the *setName* as part of a single SQL statement to separate the returned data into different dataSets.
* The *setName* column is removed from the dataset before it is returned to the callback function.
* Any field in the database that has a name ending with the string *_json* is parsed to an object using *JSON.parse()* before being returned in the dataset, and the *_json* suffix is removed from the column name. The original JSON text is also included.

### connection options
options supplied to the *connect()* function must be an object with this structure - see below for the meaning of each option:

    {
        connectionPoolLimit: 10
        , includeMetadata: false 
        , tedious: {
            server: "SERVER_NAME_OR_IP"
            , authentication: {
                type: "default"
                , options: { 
                    userName: "userName"
                    , password: "password"
                }
            }
            , options: {
                database: "defaultDatabaseName"
                , "trustServerCertificate": true
            }
        }
    }

The meanings of the connection options are:
* connectionPoolLimit
    * *Default: 10*. The maximum allowed number of simultaneous connections to the database held in the connection pool. While the number of connections is below the limit, **setedious** automatically opens additional connections to the database if *execSql()* is called when all the existing connections are already busy with earlier requests. Without a limit this could mean that more connections are opened than is desirable, for example if occasional bursts of calls are made in quick succession. However if the limit is set too low to handle the general volume of requests for the application, this may result in a large queue of SQL requests buiding up - see *Request queueing* below.
* includeMetadata
    * *Default: false*. If set to **true**, then per-field metadata is included in the returned dataset as separate fields in the *first row of the dataset only*. Each metadata field is named with a trailing underscore after the field name to which it relates. The first row of the dataset that contains actual data is the second row. *If no rows are returned, then no metadata is returned either*.
* tedious
    * This section contains the options passed to **tedious** to establish a database connection - see **tedious** documentation for details. **NOTE:** Some **tedious** options are not available:
        * opt.rowCollectionOnDone - ignored
        * opt.useColumnNames - overridden to **true**: column names are always used as field names in the returned dataSet
        * opt.rowCollectionOnRequestCompletion - ignored
## Request queueing
**setedious** maintains a pool of connections to the database which are used to dispatch *execSql()* in order of arrival. If a call is made to *execSql* when there are no free connections available, because earlier calls have used them up and the results have not yet been returned, then **setedious** initiates opening a new connection, which is added to the pool.

While a new pool connection is pending, no further new connection requests are made. Any further calls to *execSql* are queued.

As soon as either a) one of the previously-occupied connections is freed or b) a new connection request is fulfilled, then the longest-waiting *execSql()* request is dispatched from the queue. If there are still queued requests and no pending new connection requests, another new connection is opened.

If the connection limit has been reached (options.connectionPoolLimit) than no further new connections to the database will be requested, and queued requests must wait for the existing connections to be freed up.

## Error handling
Errors are handled by the creation of an ERROR dataset, which is then delivered to handlers that have been registered by either *setedious.on( "ERROR", handler )* or *setedious.onError( handler )*.

If an ERROR dataset is returned as a result of execution of a request, it is returned to the *execSql* callback function as the *err* parameter. Otherwise *err* is null.

Note that any dataset with the setName **ERROR**, whenever received, will be passed to all handlers registered using *.on("ERROR", handler())* . ERROR datasets can be returned from within stored procedures. 

