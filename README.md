# setedious
A wrapper for [tedious] that returns named data sets from multiple SQL Selects, or SP calls

Basic features
* Simple submission of SQL statements with a callback:
    
        setedious.execSql( sqlStatement, callback );
    *The callback receives a single object containing all the datasets created by the SQL statement, including all datasets selected with stored procedure calls*

* Events to catch datasets with specific names whenever returned
    
        setedious.onDataset( datasetName, callback );
    *The callback receives an object containing the a dataset whenever that named dataset is returned by any submitted SQL statement*
    

## usage

    // load module
    const setedious = require( `setedious` );
    // make connection to the database
    setedious.connect( connectOptions );

    // register a handler called whenever named set is returned
    setedious.onDataset( "myNamedSet", logSet );
    
    // Handler used whenever dataset with specific name is returned
    function logSet( dataSet ){
        console.log( `dataSet ${dataSet.setName} has been returned` );
    }

    // create and submit the SQL, with handler for returned dataset
    let sql = "SELECT 'myNamedSet' setName, * from myTable;";
    setedious.execSQL( sql , myDataSetHandler );

    // Handler used for specific execSQL call
    function myDataSetHandler( dataSet ){
        console.log( dataSet );
    }
### setName in SQL statements
To correctly allocate returned data rows to a named dataSet, the first column of a result set must be named **setName** and be set to the string name of the dataset:

*Example*

    SELECT "PERSONS" setName, * FROM T_PERSONS;
**NOTES**
 * If no set name is given, then the name defaults to **dataSet**. 
* If multiple SQL statements in a single request return rows with the **same** *setName* then all the rows returned from those SQL statements are concatenated in a single dataset. This is similar to a SQL *UNION* statement.
* If different rows returned from a single SQL statement have different *setNames* then the rows will be separated into multiple dataSets with different names. This means you can allocate the value of the *setName* as part of a single SQL statement to separate the returned data into different dataSets.
* The *setName* column is removed from the dataset before it is returned to the callback function.
* Any field in the database that has a name ending with the string *_json* is parsed to a js object before being returned in the dataset, and the *_json* suffix is removed from the column name.

### connection options
options supplied to the *connect()* function must be an object with this structure - see below for meaning of each option:

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
**setedious** maintains a pool of connections to the database which are used to dispatch *execSql()* in order of arrival. If a call is made to *execSql* when there are no free connections available, because earlier calls have used them up and the results have not yet been returned, then **setedious** initiates opening a new connection.

While a new connection is pending, no further new connection requests are made, even if further calls to *execSql* are received.

As soon as either a) one of the previously-occupied connections is freed or b) a new connection request is fulfilled, then the longest-waiting *execSql()* request is dispatched from the queue.

If the connection limit has been reached (options.connectionPoolLimit) than no further new connections to the database will be requested, and queued requests must wait for the existing connections to be freed up.

## Error handling
Errors are handled by the creation of an ERROR dataset, which is then delivered to handlers that have been registered by either *setedious.on( "ERROR", handler )* or *setedious.onError( handler )*.

Note that any dataset with the setName **ERROR**, whenever received, will be passed to these handlers. This means that error datasets can be returned from within stored procedures and these will be sent to the registered error handler functions. Further, if an ERROR dataset is returned as a result of a call to *execSql()* then this dataset will also be returned as the first, **err** parameter of the callback for that specific call, if any.