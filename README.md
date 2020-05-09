# setedious
A wrapper for [tedious] that returns named data sets from multiple SQL Selects, or SP calls

Basic features
* Simple submission of SQL statements with a callback:
    
        setedious.execSql( sqlStatement, callback );
    *The callback receives a single object containing all the datasets created by the SQL statement*

* Events to catch datasets with specific names whenever returned
    
        setedious.onDataset( datasetName, callback );
    *The callback receives an object containing the a dataset whenever that named dataset is returned by any submitted SQL statement*
    

## usage

    const setedious = require( `setedious` );

    setedious.connect( connectOptions );

    setedious.onDataset( "myNamedSet", logSet );

    let sql = "SELECT 'myNamedSet' setName, * from myTable;";
    setedious.execSQL( sql , myDataSetHandler );

    function myDataSetHandler( dataSet ){
        console.log( dataSet );
    }
    
    function logSet( dataSet ){
        console.log( `dataSet ${dataSet.key[0]} has been returned` );
    }
### setName in SQL statements
To correctly allocate returned data rows, the first column of a result set must be named **setName** and be set to the string name of the dataset. If no set name is given, then the name defaults to **dataSet**. 

If multiple SQL statements return rows with the **same** *setName* then all the rows returned from all the SQL statements are concatenated in the same-named dataset. This is similar to a SQL *UNION* statement.

If different rows returned from a single SQL statement have different *setNames* then the rows will be separated into two dataSets with different names. This means you can allocate the value of the *setName* as part of the SQL statement to separate the returned data into different dataSets.

### connection options
options supplied to the connect function as an object with this structure:

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
    * *Default: 5* The maximum allowed number of simultaneous connections to the database. **setedious** automatically opens additional connections to the database if *execSql()* is called when all the existing connections are already busy. This might mean that more connections are opened than should be. However if set too low to handle the volume of requests for the application, this may result in a large queue of SQL requests waiting to be executed - see *Request queueing* below.
* includeMetadata
    * *Default: false* If set to **true**, then per-field metadata is included in the returned dataset as separate fields in the *first row of the dataset only*. Each metadata field is named with a trailing underscore after the field name to which it relates. The first row of the dataset that contains actual data is the second row. *If no rows are returned, then no metadata is returned either*.
* tedious
    * This section contains the options passed to **tedious** to establish a database connection - see **tedious** documentation for details. **NOTE:** Some **tedious** options are not available:
        * opt.rowCollectionOnDone - ignored
        * opt.useColumnNames - always **true**: column names are always used as field names in the returned dataSet
        * opt.rowCollectionOnRequestCompletion - ignored
